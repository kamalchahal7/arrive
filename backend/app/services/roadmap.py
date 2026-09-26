"""Roadmap engine: human-written step templates matched to a profile. The model never adds or changes steps;
Gemini only translates the wording (cached per template and language)."""

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import asyncpg
from pydantic import BaseModel

from app import prompts
from app.services import gemini
from app.services.topics import language_name

logger = logging.getLogger("arrive.roadmap")

TEMPLATES_FILE = Path(__file__).resolve().parent.parent / "data" / "step_templates.json"
MVP_STATUSES = {"refugee_pr", "international_student"}
TRANSLATED_FIELDS = ("title", "summary", "documents", "where", "timing_label")


# ---------- templates ----------

def load_templates_file(path: Path = TEMPLATES_FILE) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else data.get("templates", [])


def english_content(t: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": t["title_en"],
        "summary": t["summary_en"],
        "documents": list(t.get("documents") or []),
        "where": t.get("where_en") or "",
        "timing_label": (t.get("timing") or {}).get("label_en") or "",
    }


def content_hash(t: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(english_content(t), sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


async def sync_templates(pool: asyncpg.Pool) -> int:
    """Upsert step_templates.json into the database (run on startup)."""
    templates = load_templates_file()
    async with pool.acquire() as conn, conn.transaction():
        for t in templates:
            await conn.execute(
                """INSERT INTO step_templates (id, title_en, summary_en, conditions, documents, where_en, timing,
                                               source_url, topic, order_hint, unlocks, reviewed, content_hash)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                   ON CONFLICT (id) DO UPDATE SET title_en = EXCLUDED.title_en, summary_en = EXCLUDED.summary_en,
                       conditions = EXCLUDED.conditions, documents = EXCLUDED.documents, where_en = EXCLUDED.where_en,
                       timing = EXCLUDED.timing, source_url = EXCLUDED.source_url, topic = EXCLUDED.topic,
                       order_hint = EXCLUDED.order_hint, unlocks = EXCLUDED.unlocks, reviewed = EXCLUDED.reviewed,
                       content_hash = EXCLUDED.content_hash""",
                t["id"], t["title_en"], t["summary_en"], t.get("conditions") or {}, t.get("documents") or [],
                t.get("where_en") or "", t.get("timing") or {}, t["source_url"], t["topic"],
                int(t.get("order_hint") or 100), list(t.get("unlocks") or []), bool(t.get("reviewed")), content_hash(t),
            )
    return len(templates)


# ---------- matching ----------

def weeks_since(arrival: date | None, today: date) -> int | None:
    if not arrival:
        return None
    return max(0, (today - arrival).days // 7)


def matches(t: dict[str, Any], profile: dict[str, Any], today: date) -> bool:
    c = t.get("conditions") or {}
    status = profile.get("status") or "unknown"
    statuses = set(c.get("statuses") or [])
    if statuses:
        if status in MVP_STATUSES or status not in ("unknown", None):
            if status not in statuses:
                return False
        elif not MVP_STATUSES <= statuses:
            # Status "not sure": show only steps that apply to every status we support.
            return False

    province = profile.get("province") or "unknown"
    if c.get("provinces") and province != "unknown" and province not in c["provinces"]:
        return False
    city = profile.get("city") or "unknown"
    if c.get("cities") and city != "unknown" and city not in c["cities"]:
        return False
    # "Not sure" (None) keeps the step visible; an explicit "no" hides it.
    if c.get("requires_children") and profile.get("has_children") is False:
        return False
    if c.get("requires_seniors") and profile.get("has_seniors") is False:
        return False
    min_weeks = int(c.get("min_weeks_since_arrival") or 0)
    weeks = weeks_since(profile.get("arrival_date"), today)
    if min_weeks and weeks is not None and weeks < min_weeks:
        return False
    return True


def due_date_for(t: dict[str, Any], arrival: date | None) -> date | None:
    timing = t.get("timing") or {}
    kind = timing.get("kind")
    if not arrival:
        return None
    if kind == "after_arrival" and timing.get("days") is not None:
        return arrival + timedelta(days=int(timing["days"]))
    if kind == "annual_deadline" and timing.get("month") and timing.get("day"):
        # First filing season after the year of arrival (e.g. taxes for the arrival year).
        return date(arrival.year + 1, int(timing["month"]), int(timing["day"]))
    return None


def order_key(t: dict[str, Any], due: date | None) -> tuple[int, date]:
    return (int(t.get("order_hint") or 100), due or date.max)


# ---------- translation ----------

class _TItem(BaseModel):
    id: str
    title: str
    summary: str
    documents: list[str]
    where: str
    timing_label: str


class _TBatch(BaseModel):
    items: list[_TItem]


async def translate_templates(
    pool: asyncpg.Pool, templates: list[dict[str, Any]], language: str
) -> dict[str, dict[str, Any]]:
    """Return {template_id: content} in the language. English is returned as-is."""
    out = {t["id"]: english_content(t) for t in templates}
    if language == "en" or not templates:
        return out
    hashes = {t["id"]: content_hash(t) for t in templates}
    rows = await pool.fetch(
        "SELECT template_id, content, content_hash FROM template_translations WHERE language = $1 AND template_id = ANY($2)",
        language, list(hashes),
    )
    missing = set(hashes)
    for r in rows:
        if r["content_hash"] == hashes[r["template_id"]]:
            out[r["template_id"]] = r["content"]
            missing.discard(r["template_id"])
    if not missing:
        return out

    items = [{"id": t["id"], **english_content(t)} for t in templates if t["id"] in missing]
    try:
        batch = await gemini.get_gemini().generate_json(
            "translate_templates",
            prompts.render("translate_templates", language=language_name(language), items=json.dumps(items, ensure_ascii=False)),
            _TBatch,
            temperature=0,
            timeout=60,
        )
    except Exception:
        logger.warning("template translation failed for %s; showing English", language)
        return out
    for item in batch.items:
        if item.id not in missing:
            continue
        # Document lists must keep the same length: a translation may not add or drop documents.
        english = out[item.id]
        if len(item.documents) != len(english["documents"]):
            continue
        content = item.model_dump(exclude={"id"})
        out[item.id] = content
        await pool.execute(
            """INSERT INTO template_translations (template_id, language, content, content_hash) VALUES ($1, $2, $3, $4)
               ON CONFLICT (template_id, language) DO UPDATE SET content = EXCLUDED.content,
                   content_hash = EXCLUDED.content_hash, created_at = now()""",
            item.id, language, content, hashes[item.id],
        )
    return out


# ---------- roadmap ----------

@dataclass
class RoadmapStep:
    id: str
    template_id: str | None
    custom: bool
    title: str
    summary: str
    documents: list[str]
    where: str
    timing_label: str
    due_date: date | None
    status: str
    is_now: bool
    topic: str
    source_url: str | None
    source_title: str | None
    source_last_checked: date | None
    unlocks: list[dict[str, str]] = field(default_factory=list)
    reviewed: bool = False
    rule_may_have_changed: bool = False


@dataclass
class Roadmap:
    profile_id: str
    language: str
    weeks_since_arrival: int | None
    done: int
    total: int
    steps: list[RoadmapStep]


async def all_templates(pool: asyncpg.Pool) -> list[dict[str, Any]]:
    return [dict(r) for r in await pool.fetch("SELECT * FROM step_templates")]


async def build_roadmap(pool: asyncpg.Pool, profile: dict[str, Any], language: str, today: date | None = None) -> Roadmap:
    today = today or datetime.now(timezone.utc).date()
    templates = [t for t in await all_templates(pool) if matches(t, profile, today)]
    arrival = profile.get("arrival_date")
    pid = profile["id"]

    # Make sure every matched template has a user_steps row (keeps done/skipped state).
    for t in templates:
        await pool.execute(
            """INSERT INTO user_steps (profile_id, template_id, due_date) VALUES ($1, $2, $3)
               ON CONFLICT (profile_id, template_id) WHERE template_id IS NOT NULL
               DO UPDATE SET due_date = EXCLUDED.due_date""",
            pid, t["id"], due_date_for(t, arrival),
        )
    rows = await pool.fetch(
        """SELECT us.*, s.title AS source_title, s.last_fetched_at,
                  EXISTS (
                      SELECT 1 FROM source_snapshots ss
                      WHERE ss.source_id = s.id AND ss.changed AND ss.time > us.created_at
                        AND ss.time > (SELECT min(time) FROM source_snapshots f WHERE f.source_id = s.id)
                  ) AS changed_since
           FROM user_steps us
           LEFT JOIN step_templates st ON st.id = us.template_id
           LEFT JOIN sources s ON s.url = st.source_url
           WHERE us.profile_id = $1""",
        pid,
    )
    by_template = {t["id"]: t for t in templates}
    texts = await translate_templates(pool, templates, language)

    steps: list[RoadmapStep] = []
    for r in rows:
        tid = r["template_id"]
        if tid is not None and tid not in by_template:
            continue  # template no longer matches this profile
        if tid is None:
            steps.append(RoadmapStep(
                id=str(r["id"]), template_id=None, custom=True, title=r["custom_title"], summary=r["custom_note"] or "",
                documents=[], where="", timing_label="", due_date=r["due_date"], status=r["status"], is_now=False,
                topic="other", source_url=None, source_title=None, source_last_checked=None,
            ))
            continue
        t, text = by_template[tid], texts[tid]
        steps.append(RoadmapStep(
            id=str(r["id"]), template_id=tid, custom=False, title=text["title"], summary=text["summary"],
            documents=text["documents"], where=text["where"], timing_label=text["timing_label"],
            due_date=r["due_date"], status=r["status"], is_now=False, topic=t["topic"],
            source_url=t["source_url"], source_title=r["source_title"],
            source_last_checked=r["last_fetched_at"].date() if r["last_fetched_at"] else None,
            reviewed=t["reviewed"], rule_may_have_changed=bool(r["changed_since"]),
        ))

    def key(s: RoadmapStep) -> tuple[int, date]:
        if s.custom:
            return (0 if s.due_date else 999, s.due_date or date.max)  # letter deadlines float to the top
        return order_key(by_template[s.template_id], s.due_date)  # type: ignore[index]

    steps.sort(key=key)
    in_roadmap = {s.template_id: s for s in steps if s.template_id}
    for s in steps:
        if s.template_id:
            s.unlocks = [
                {"id": u, "title": in_roadmap[u].title}
                for u in by_template[s.template_id].get("unlocks") or []
                if u in in_roadmap
            ]
    for s in steps:
        if s.status == "todo":
            s.is_now = True
            break

    return Roadmap(
        profile_id=str(pid), language=language, weeks_since_arrival=weeks_since(arrival, today),
        done=sum(1 for s in steps if s.status == "done"), total=len(steps), steps=steps,
    )


async def preview_steps(
    pool: asyncpg.Pool, profile: dict[str, Any], language: str, limit: int = 3
) -> list[dict[str, Any]]:
    """First steps for a profile without saving anything (used by the phone agent when there is no profile)."""
    today = datetime.now(timezone.utc).date()
    arrival = profile.get("arrival_date")
    templates = [t for t in await all_templates(pool) if matches(t, profile, today)]
    templates.sort(key=lambda t: order_key(t, due_date_for(t, arrival)))
    texts = await translate_templates(pool, templates[:limit], language)
    return [{"id": t["id"], **texts[t["id"]]} for t in templates[:limit]]


async def set_step_status(pool: asyncpg.Pool, step_id: uuid.UUID, status: str) -> bool:
    res = await pool.execute(
        """UPDATE user_steps SET status = $2, completed_at = CASE WHEN $2 = 'done' THEN now() ELSE NULL END
           WHERE id = $1""",
        step_id, status,
    )
    return res.endswith(" 1")


async def add_custom_step(pool: asyncpg.Pool, profile_id: uuid.UUID, title: str, due: date | None, note: str | None) -> str:
    row = await pool.fetchrow(
        "INSERT INTO user_steps (profile_id, custom_title, custom_note, due_date) VALUES ($1, $2, $3, $4) RETURNING id",
        profile_id, title, note, due,
    )
    return str(row["id"])
