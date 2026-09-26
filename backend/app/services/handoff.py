"""Handoff to a real person. Only created with explicit consent. Gemini writes a short note for the worker
using only what the person said."""

import asyncio
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

import asyncpg
from pydantic import BaseModel

from app import prompts
from app.services import gemini, request_log
from app.services.answer import situation_text
from app.services.classifier import classify
from app.services.privacy import scrub
from app.services.profiles import get_profile, region_of
from app.services.topics import language_name

CONTACT_METHODS = ("phone", "text", "whatsapp", "email", "in_person")
URGENCY_ORDER = {"emergency": 0, "high": 1, "normal": 2}


class _Summary(BaseModel):
    summary_en: str
    summary_native: str
    already_done: str | None = None
    deadline: str | None = None


def _household(profile: dict[str, Any] | None) -> str | None:
    if not profile:
        return None
    parts = []
    if profile.get("has_children"):
        parts.append("children")
    if profile.get("has_seniors"):
        parts.append("seniors")
    return "Family with " + " and ".join(parts) if parts else None


def _parse_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None


@dataclass
class HandoffCreated:
    id: str
    summary_native: str
    urgency: str


async def create_handoff(
    pool: asyncpg.Pool,
    *,
    need: str,
    language: str,
    contact_method: str,
    contact_value: str | None,
    preferred_time: str | None,
    consent: bool,
    channel: str = "web",
    profile_id: str | None = None,
    request_id: uuid.UUID | None = None,
    topic_hint: str | None = None,
) -> HandoffCreated:
    if not consent:
        raise ValueError("consent_required")
    if contact_method not in CONTACT_METHODS:
        raise ValueError("invalid_contact_method")

    profile = await get_profile(pool, profile_id)
    today = datetime.now(timezone.utc).date()
    cls, summary = await asyncio.gather(
        classify(need, language),
        gemini.get_gemini().generate_json(
            "handoff_summary",
            prompts.render(
                "handoff_summary", language=language_name(language), today=today.isoformat(),
                situation=situation_text(profile), need=need,
            ),
            _Summary,
            temperature=0.1,
        ),
    )
    topic = cls.topic if cls.topic != "other" or not topic_hint else topic_hint
    row = await pool.fetchrow(
        """INSERT INTO handoffs (language, topic, summary, summary_native, already_done, household, status_category,
                                 contact_method, contact_value, preferred_time, consent, urgency, deadline, channel)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12, $13) RETURNING id""",
        language, topic, scrub(summary.summary_en), scrub(summary.summary_native), scrub(summary.already_done),
        _household(profile), (profile or {}).get("status") or "unknown", contact_method,
        (contact_value or "").strip()[:200] or None, (preferred_time or "").strip()[:100] or None,
        cls.urgency, _parse_date(summary.deadline), channel,
    )
    await request_log.log_request(
        pool, channel=channel, kind="handoff", language=language, topic=topic,
        status_category=(profile or {}).get("status"), region=region_of(profile), handed_off=True,
    )
    if request_id:
        await request_log.mark_handed_off(pool, request_id)
    return HandoffCreated(id=str(row["id"]), summary_native=summary.summary_native, urgency=cls.urgency)


async def list_handoffs(pool: asyncpg.Pool, status: str | None = None) -> list[dict[str, Any]]:
    rows = await pool.fetch(
        """SELECT * FROM handoffs WHERE ($1::text IS NULL OR status = $1)
           ORDER BY CASE urgency WHEN 'emergency' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
                    (status = 'resolved'), deadline NULLS LAST, created_at""",
        status,
    )
    return [dict(r) for r in rows]


async def get_handoff(pool: asyncpg.Pool, handoff_id: uuid.UUID) -> dict[str, Any] | None:
    row = await pool.fetchrow("SELECT * FROM handoffs WHERE id = $1", handoff_id)
    return dict(row) if row else None


async def update_handoff(
    pool: asyncpg.Pool, handoff_id: uuid.UUID, *, status: str | None, assigned_to: str | None
) -> dict[str, Any] | None:
    row = await pool.fetchrow(
        """UPDATE handoffs SET status = COALESCE($2, status), assigned_to = COALESCE($3, assigned_to), updated_at = now()
           WHERE id = $1 RETURNING *""",
        handoff_id, status, assigned_to,
    )
    return dict(row) if row else None
