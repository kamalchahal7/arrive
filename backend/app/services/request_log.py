"""Anonymized request log: one row per interaction, no raw text, no personal details.

Only fixed categories are stored (channel, kind, language, topic, status, city-level region, flags).
The only free text is gap_summary: a generic description written by Gemini and then scrubbed with regexes.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime

import asyncpg
from pydantic import BaseModel, Field

from app import prompts
from app.services import gemini
from app.services.privacy import scrub
from app.services.topics import clean_topic

logger = logging.getLogger("arrive.request_log")

CHANNELS = {"web", "voice_web", "phone"}
KINDS = {"ask", "letter", "scam", "handoff", "roadmap"}
KNOWN_REGIONS = {"ottawa", "ontario_other", "unknown"}
KNOWN_STATUSES = {
    "refugee_pr", "international_student", "asylum_claimant", "economic_pr", "family_class",
    "temporary_worker", "unknown",
}


@dataclass
class LogRef:
    id: uuid.UUID
    time: datetime


def _language_code(value: str | None) -> str:
    # Only a short language code is stored, never free text.
    code = (value or "unknown").lower().strip()[:8]
    return code if code.replace("-", "").isalpha() else "unknown"


async def log_request(
    pool: asyncpg.Pool,
    *,
    channel: str,
    kind: str,
    language: str | None,
    topic: str | None,
    status_category: str | None = None,
    region: str | None = None,
    answered: bool = False,
    handed_off: bool = False,
    scam_flag: bool = False,
    source_ids: list[int] | None = None,
) -> LogRef | None:
    """Insert one anonymized row. Logging failures never break the user's request."""
    try:
        row = await pool.fetchrow(
            """INSERT INTO request_log (channel, kind, language, topic, status_category, region,
                                        answered, handed_off, scam_flag, source_ids)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, time""",
            channel if channel in CHANNELS else "web",
            kind if kind in KINDS else "ask",
            _language_code(language),
            clean_topic(topic),
            status_category if status_category in KNOWN_STATUSES else "unknown",
            region if region in KNOWN_REGIONS else "unknown",
            answered,
            handed_off,
            scam_flag,
            sorted(set(source_ids or [])),
        )
        return LogRef(row["id"], row["time"])
    except Exception as exc:
        logger.error("request_log insert failed: %s", type(exc).__name__)
        return None


class GapSummary(BaseModel):
    summary: str = Field(description="Generic description of the information need, max 12 words, English")


async def make_gap_summary(question: str, topic: str) -> str | None:
    """A generic, de-identified description of what someone asked, for the knowledge-gaps table."""
    try:
        res = await gemini.get_gemini().generate_json(
            "gap_summary", prompts.render("gap_summary", question=question, topic=topic), GapSummary, temperature=0
        )
    except Exception:
        return None
    text = scrub(res.summary.strip().rstrip("."))
    return text[:120] if text else None


async def record_gap(pool: asyncpg.Pool, ref: LogRef, question: str, topic: str) -> None:
    summary = await make_gap_summary(question, topic)
    if not summary:
        return
    try:
        await pool.execute(
            "UPDATE request_log SET gap_summary = $1 WHERE id = $2 AND time = $3", summary, ref.id, ref.time
        )
    except Exception as exc:
        logger.error("gap_summary update failed: %s", type(exc).__name__)


async def set_clarity(pool: asyncpg.Pool, request_id: uuid.UUID, clarity: int) -> bool:
    status = await pool.execute(
        "UPDATE request_log SET clarity = $1 WHERE id = $2 AND time > now() - INTERVAL '2 days'", clarity, request_id
    )
    return status.endswith(" 1")


async def mark_handed_off(pool: asyncpg.Pool, request_id: uuid.UUID) -> None:
    await pool.execute(
        "UPDATE request_log SET handed_off = true WHERE id = $1 AND time > now() - INTERVAL '2 days'", request_id
    )
