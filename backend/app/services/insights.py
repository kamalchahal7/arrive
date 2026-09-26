"""Aggregated, anonymized insights from the continuous aggregates, with small-group suppression.

Every count shown for a group smaller than INSIGHTS_MIN_GROUP_SIZE becomes the string "<N" instead of a number.
Rates and changes are only computed when the underlying groups are large enough.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

import asyncpg
from pydantic import BaseModel

from app import prompts
from app.config import get_settings
from app.services import gemini
from app.services.topics import topic_label

logger = logging.getLogger("arrive.insights")

SPIKE_RATIO = 1.5

Count = int | str


def min_group() -> int:
    return get_settings().insights_min_group_size


def suppress(n: int) -> Count:
    return n if n >= min_group() else f"<{min_group()}"


def rate(part: int, whole: int) -> float | None:
    return round(part / whole, 3) if whole >= min_group() else None


def pct_change(now: int, before: int) -> float | None:
    if now < min_group() or before < min_group():
        return None
    return round((now - before) / before * 100, 1)


async def _has_sample(pool: asyncpg.Pool) -> bool:
    return bool(await pool.fetchval("SELECT EXISTS (SELECT 1 FROM request_log WHERE is_sample LIMIT 1)"))


async def overview(pool: asyncpg.Pool) -> dict[str, Any]:
    # Rolling 7-day windows over the daily continuous aggregate.
    totals = await pool.fetchrow(
        """SELECT
             COALESCE(sum(total) FILTER (WHERE bucket >= now() - INTERVAL '7 days'), 0)::int AS this_week,
             COALESCE(sum(total) FILTER (WHERE bucket < now() - INTERVAL '7 days'), 0)::int AS last_week,
             COALESCE(sum(answered) FILTER (WHERE bucket >= now() - INTERVAL '7 days'), 0)::int AS answered,
             COALESCE(sum(handed_off) FILTER (WHERE bucket >= now() - INTERVAL '7 days'), 0)::int AS handed_off,
             COALESCE(sum(scam_flags) FILTER (WHERE bucket >= now() - INTERVAL '7 days'), 0)::int AS scam_flags
           FROM request_log_daily WHERE bucket >= now() - INTERVAL '14 days'"""
    )
    topics = await pool.fetch(
        """SELECT topic,
             COALESCE(sum(total) FILTER (WHERE bucket >= now() - INTERVAL '7 days'), 0)::int AS this_week,
             COALESCE(sum(total) FILTER (WHERE bucket < now() - INTERVAL '7 days'), 0)::int AS last_week
           FROM request_log_daily WHERE bucket >= now() - INTERVAL '14 days'
           GROUP BY topic ORDER BY this_week DESC"""
    )
    languages_now = await pool.fetch(
        """SELECT language, sum(total)::int AS n FROM request_log_daily
           WHERE bucket >= now() - INTERVAL '7 days' GROUP BY language ORDER BY n DESC"""
    )
    channels = await pool.fetch(
        """SELECT channel, sum(total)::int AS n FROM request_log_daily
           WHERE bucket >= now() - INTERVAL '7 days' GROUP BY channel ORDER BY n DESC"""
    )
    this_week, last_week = totals["this_week"], totals["last_week"]
    top_language = languages_now[0]["language"] if languages_now and languages_now[0]["n"] >= min_group() else None

    top_topics = []
    for r in topics:
        now_n, before_n = r["this_week"], r["last_week"]
        change = pct_change(now_n, before_n)
        top_topics.append({
            "topic": r["topic"],
            "label": topic_label(r["topic"]),
            "this_week": suppress(now_n),
            "last_week": suppress(before_n),
            "change_pct": change,
            "spike": now_n >= min_group() * 2 and now_n >= SPIKE_RATIO * max(before_n, 1),
        })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "has_sample_data": await _has_sample(pool),
        "min_group_size": min_group(),
        "cards": {
            "total_this_week": suppress(this_week),
            "total_change_pct": pct_change(this_week, last_week),
            "answered_rate": rate(totals["answered"], this_week),
            "handoffs": suppress(totals["handed_off"]),
            "scam_flags": suppress(totals["scam_flags"]),
            "top_language": top_language,
        },
        "top_topics": top_topics[:12],
        "channel_mix": [{"channel": r["channel"], "count": suppress(r["n"])} for r in channels],
        "languages_this_week": [{"language": r["language"], "count": suppress(r["n"])} for r in languages_now],
    }


async def over_time(pool: asyncpg.Pool, weeks: int = 8) -> dict[str, Any]:
    """Weekly totals from the weekly continuous aggregate."""
    rows = await pool.fetch(
        """SELECT bucket, sum(total)::int AS total, sum(answered)::int AS answered, sum(handed_off)::int AS handed_off
           FROM request_log_weekly WHERE bucket >= now() - make_interval(weeks => $1)
           GROUP BY bucket ORDER BY bucket""",
        weeks,
    )
    return {
        "has_sample_data": await _has_sample(pool),
        "weeks": [
            {"week": r["bucket"].date().isoformat(), "total": suppress(r["total"]),
             "answered": suppress(r["answered"]), "handed_off": suppress(r["handed_off"])}
            for r in rows
        ],
    }


async def language_demand(pool: asyncpg.Pool, weeks: int = 8) -> dict[str, Any]:
    rows = await pool.fetch(
        """SELECT bucket, language, region, sum(total)::int AS n FROM request_log_weekly
           WHERE bucket >= now() - make_interval(weeks => $1)
           GROUP BY bucket, language, region ORDER BY bucket, n DESC""",
        weeks,
    )
    by_week: dict[str, dict[str, int]] = {}
    by_region: dict[str, dict[str, int]] = {}
    for r in rows:
        wk = r["bucket"].date().isoformat()
        by_week.setdefault(wk, {})
        by_week[wk][r["language"]] = by_week[wk].get(r["language"], 0) + r["n"]
        by_region.setdefault(r["region"], {})
        by_region[r["region"]][r["language"]] = by_region[r["region"]].get(r["language"], 0) + r["n"]
    languages = sorted({lang for wk in by_week.values() for lang in wk})
    return {
        "has_sample_data": await _has_sample(pool),
        "languages": languages,
        "weeks": [{"week": wk, **{lang: suppress(v.get(lang, 0)) for lang in languages}} for wk, v in by_week.items()],
        "by_region": [
            {"region": region, "languages": [{"language": k, "count": suppress(n)} for k, n in
                                             sorted(v.items(), key=lambda kv: -kv[1])]}
            for region, v in by_region.items()
        ],
    }


class _Theme(BaseModel):
    theme: str
    members: list[int]


class _Themes(BaseModel):
    themes: list[_Theme]


async def knowledge_gaps(pool: asyncpg.Pool, days: int = 30) -> dict[str, Any]:
    rows = await pool.fetch(
        """SELECT gap_summary, topic, count(*)::int AS n FROM request_log
           WHERE gap_summary IS NOT NULL AND time >= now() - make_interval(days => $1)
           GROUP BY gap_summary, topic ORDER BY n DESC LIMIT 200""",
        days,
    )
    items = [{"summary": r["gap_summary"], "topic": r["topic"], "n": r["n"]} for r in rows]
    themes = await _cluster(pool, items)
    return {
        "has_sample_data": await _has_sample(pool),
        "days": days,
        "themes": [
            {"theme": t["theme"], "count": suppress(t["n"]), "topics": t["topics"],
             "examples": t["examples"] if t["n"] >= min_group() else []}
            for t in themes
        ],
    }


async def _cluster(pool: asyncpg.Pool, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group similar gap summaries with one Gemini call; cached by the exact input."""
    if not items:
        return []
    key = "gaps:" + hashlib.sha256(json.dumps(items, sort_keys=True).encode()).hexdigest()[:24]
    cached = await pool.fetchval("SELECT value FROM app_cache WHERE key = $1", key)
    if cached is not None:
        return cached
    try:
        listing = "\n".join(f"{i}: {it['summary']}" for i, it in enumerate(items))
        res = await gemini.get_gemini().generate_json(
            "cluster_gaps", prompts.render("cluster_gaps", items=listing), _Themes, temperature=0
        )
        groups = [[i for i in t.members if 0 <= i < len(items)] for t in res.themes]
        names = [t.theme for t in res.themes]
    except Exception:
        logger.warning("gap clustering failed; falling back to exact summaries")
        groups, names = [[i] for i in range(len(items))], [it["summary"] for it in items]

    seen: set[int] = set()
    themes = []
    for name, members in zip(names, groups, strict=True):
        members = [i for i in members if i not in seen]
        seen.update(members)
        if not members or name.lower() == "off-topic":
            continue
        members.sort(key=lambda i: -items[i]["n"])
        themes.append({
            "theme": name,
            "n": sum(items[i]["n"] for i in members),
            "topics": sorted({items[i]["topic"] for i in members}),
            "examples": [items[i]["summary"] for i in members[:3]],
        })
    themes.sort(key=lambda t: -t["n"])
    await pool.execute(
        "INSERT INTO app_cache (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        key, themes,
    )
    return themes


async def confusing_sources(pool: asyncpg.Pool, days: int = 30) -> dict[str, Any]:
    rows = await pool.fetch(
        """SELECT s.id, s.title, s.url,
                  count(*)::int AS uses,
                  count(*) FILTER (WHERE r.clarity = -1)::int AS unclear,
                  count(*) FILTER (WHERE r.clarity = 1)::int AS clear
           FROM request_log r
           CROSS JOIN LATERAL unnest(r.source_ids) AS sid
           JOIN sources s ON s.id = sid
           WHERE r.time >= now() - make_interval(days => $1)
           GROUP BY s.id, s.title, s.url
           HAVING count(*) FILTER (WHERE r.clarity = -1) > 0
           ORDER BY unclear DESC, uses DESC LIMIT 10""",
        days,
    )
    return {
        "has_sample_data": await _has_sample(pool),
        "sources": [
            {"title": r["title"], "url": r["url"], "uses": suppress(r["uses"]), "unclear": suppress(r["unclear"]),
             "unclear_rate": rate(r["unclear"], r["uses"]) if r["unclear"] >= min_group() else None}
            for r in rows
        ],
    }


async def brief(pool: asyncpg.Pool) -> dict[str, Any]:
    data = {
        "overview": await overview(pool),
        "weekly": await over_time(pool),
        "gaps": await knowledge_gaps(pool),
        "confusing_sources": await confusing_sources(pool),
    }
    sample = data["overview"]["has_sample_data"]
    text = await gemini.get_gemini().generate_text(
        "needs_brief",
        prompts.render(
            "brief",
            period="last 7 days",
            sample_note="IMPORTANT: this data includes SAMPLE (synthetic) data for a demo. Say so in the first line."
            if sample else "",
            data=json.dumps(data, default=str, ensure_ascii=False),
        ),
        temperature=0.3,
        timeout=60,
    )
    return {"has_sample_data": sample, "markdown": text, "generated_at": datetime.now(timezone.utc).isoformat()}
