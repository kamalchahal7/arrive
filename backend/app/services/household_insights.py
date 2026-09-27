"""Needs dashboard additions for the redesign (docs/REDESIGN.md section 9): program interest by language group,
checklist bottlenecks, time to complete essential items, survey satisfaction and missing-feature themes.
Grouped by language and (with consent) country of origin only; groups under the minimum size are suppressed."""

from typing import Any

import asyncpg

from app.services import checklist as engine
from app.services.insights import _cluster, _has_sample, min_group, rate, suppress


async def program_interest(pool: asyncpg.Pool, weeks: int = 12) -> dict[str, Any]:
    rows = await pool.fetch(
        """SELECT target_id, language, country_of_origin, sum(interested)::int AS n
           FROM program_interest_weekly WHERE bucket >= now() - make_interval(weeks => $1)
           GROUP BY target_id, language, country_of_origin""",
        weeks,
    )
    by_lang: dict[tuple[str, str], int] = {}
    by_country: dict[tuple[str, str], int] = {}
    for r in rows:
        by_lang[(r["target_id"], r["language"])] = by_lang.get((r["target_id"], r["language"]), 0) + r["n"]
        if r["country_of_origin"]:
            key = (r["target_id"], r["country_of_origin"])
            by_country[key] = by_country.get(key, 0) + r["n"]
    titles = {p["id"]: p["title"] for p in engine.programs()}
    fmt = lambda d, k: sorted(  # noqa: E731
        ({"program": t, "title": titles.get(t, t), k: g, "count": suppress(n), "_n": n} for (t, g), n in d.items()),
        key=lambda x: -x["_n"],
    )
    strip = lambda xs: [{k: v for k, v in x.items() if k != "_n"} for x in xs]  # noqa: E731
    return {
        "has_sample_data": await _has_sample(pool),
        "weeks": weeks,
        "by_language": strip(fmt(by_lang, "language")),
        "by_country": strip(fmt(by_country, "country")),
    }


async def checklist_bottlenecks(pool: asyncpg.Pool, weeks: int = 12, stall_days: int = 14) -> dict[str, Any]:
    rows = await pool.fetch(
        """SELECT target_id,
                  sum(total) FILTER (WHERE event = 'view_item')::int AS views,
                  sum(total) FILTER (WHERE event = 'item_done')::int AS done,
                  sum(total) FILTER (WHERE event = 'staff_card_opened')::int AS cards
           FROM item_activity_weekly WHERE bucket >= now() - make_interval(weeks => $1) AND target_id IS NOT NULL
           GROUP BY target_id""",
        weeks,
    )
    # People who looked at an item more than stall_days ago and never marked it done.
    stalled = await pool.fetch(
        """SELECT v.target_id, count(DISTINCT v.profile_ref)::int AS n
           FROM session_events v
           WHERE v.event = 'view_item' AND v.profile_ref IS NOT NULL AND v.time < now() - make_interval(days => $1)
             AND NOT EXISTS (SELECT 1 FROM session_events d WHERE d.event = 'item_done'
                             AND d.profile_ref = v.profile_ref AND d.target_id = v.target_id)
           GROUP BY v.target_id""",
        stall_days,
    )
    stall = {r["target_id"]: r["n"] for r in stalled}
    titles = {i["id"]: i["title"] for i in engine.checklist_items()}
    items = sorted(rows, key=lambda r: -(stall.get(r["target_id"], 0)))
    return {
        "has_sample_data": await _has_sample(pool),
        "stall_days": stall_days,
        "items": [
            {"item": r["target_id"], "title": titles.get(r["target_id"], r["target_id"]),
             "views": suppress(r["views"] or 0), "done": suppress(r["done"] or 0),
             "staff_cards": suppress(r["cards"] or 0), "stalled": suppress(stall.get(r["target_id"], 0)),
             "done_rate": rate(r["done"] or 0, r["views"] or 0)}
            for r in items if r["target_id"] in titles
        ],
    }


async def essential_times(pool: asyncpg.Pool) -> dict[str, Any]:
    essential = [i["id"] for i in engine.checklist_items() if i.get("essential")]
    rows = await pool.fetch(
        """SELECT item_id, count(*)::int AS n,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY days_to_complete) AS median_days
           FROM item_completion_times WHERE item_id = ANY($1::text[]) GROUP BY item_id""",
        essential,
    )
    titles = {i["id"]: i["title"] for i in engine.checklist_items()}
    return {
        "items": [
            {"item": r["item_id"], "title": titles.get(r["item_id"], r["item_id"]), "completed": suppress(r["n"]),
             "median_days": round(r["median_days"], 1) if r["n"] >= min_group() and r["median_days"] is not None else None}
            for r in rows
        ]
    }


async def survey(pool: asyncpg.Pool, weeks: int = 12, days: int = 60) -> dict[str, Any]:
    rows = await pool.fetch(
        """SELECT bucket, language, sum(responses)::int AS responses, sum(rated)::int AS rated,
                  (sum(satisfaction * rated) / NULLIF(sum(rated), 0))::float AS satisfaction
           FROM survey_weekly WHERE bucket >= now() - make_interval(weeks => $1)
           GROUP BY bucket, language ORDER BY bucket""",
        weeks,
    )
    texts = await pool.fetch(
        """SELECT missing_features, count(*)::int AS n FROM survey_responses
           WHERE missing_features IS NOT NULL AND time >= now() - make_interval(days => $1)
           GROUP BY missing_features ORDER BY n DESC LIMIT 200""",
        days,
    )
    themes = await _cluster(pool, [{"summary": r["missing_features"], "topic": "survey", "n": r["n"]} for r in texts])
    return {
        "has_sample_data": await _has_sample(pool),
        "weeks": [
            {"week": r["bucket"].date().isoformat(), "language": r["language"], "responses": suppress(r["responses"]),
             "satisfaction": round(r["satisfaction"], 2) if r["rated"] >= min_group() and r["satisfaction"] else None}
            for r in rows
        ],
        # Scrubbed free text is only shown for themes with enough answers.
        "missing_themes": [
            {"theme": t["theme"], "count": suppress(t["n"]), "examples": t["examples"] if t["n"] >= min_group() else []}
            for t in themes
        ],
    }
