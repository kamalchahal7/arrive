"""Anonymized session events and the end-of-session survey (docs/REDESIGN.md sections 9 and 10).

Events carry fixed categories only. The profile is referenced by a salted hash (never its ID), the city is
"ottawa" / "other", the household is a coarse type, and country of origin is kept only with analytics consent.
"""

import hashlib
import hmac
import logging
import re
from typing import Any

import asyncpg

from app.config import get_settings
from app.services.privacy import scrub

logger = logging.getLogger("arrive.events")

EVENTS = (
    "view_item", "view_program", "program_interest", "item_done", "assistant_question", "staff_card_opened",
    "language_changed",
)
TARGET = re.compile(r"^[a-z0-9_]{2,60}$")
SESSION = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def profile_ref(profile: dict[str, Any] | None) -> str | None:
    """Salted hash of the internal profile uuid. None without a profile or without ANALYTICS_SALT."""
    salt = get_settings().analytics_salt
    if not profile or not salt:
        return None
    return hmac.new(salt.encode(), str(profile["id"]).encode(), hashlib.sha256).hexdigest()[:32]


def household_type(p: dict[str, Any] | None) -> str:
    if not p:
        return "unknown"
    children = int(p.get("children_0_5") or 0) + int(p.get("children_6_17") or 0)
    seniors = int(p.get("seniors") or 0)
    size = int(p.get("adults") or 0) + seniors + children
    if size <= 1:
        return "single_senior" if seniors else "single_adult"
    if children and seniors:
        return "family_children_seniors"
    if children:
        return "family_children"
    if seniors:
        return "family_seniors"
    return "adults_only"


def city_of(p: dict[str, Any] | None) -> str:
    if not p:
        return "unknown"
    return "ottawa" if p.get("city") == "ottawa" else "other" if p.get("city") == "other" else "unknown"


def _language(value: str | None) -> str:
    code = (value or "unknown").lower()[:8]
    return code if re.fullmatch(r"[a-z-]{2,8}", code) else "unknown"


async def log_event(
    pool: asyncpg.Pool, *, session_id: str, event: str, language: str | None, profile: dict[str, Any] | None,
    target_id: str | None = None,
) -> bool:
    if event not in EVENTS or not SESSION.match(session_id or ""):
        return False
    target = target_id if target_id and TARGET.match(target_id) else None
    country = (profile or {}).get("country_of_origin") if (profile or {}).get("analytics_consent") else None
    try:
        await pool.execute(
            """INSERT INTO session_events (session_id, profile_ref, event, target_id, language, country_of_origin,
                                           household_type, city)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
            session_id, profile_ref(profile), event, target, _language(language), country,
            household_type(profile), city_of(profile),
        )
        return True
    except Exception as exc:  # analytics never breaks the app
        logger.error("session_events insert failed: %s", type(exc).__name__)
        return False


async def save_survey(
    pool: asyncpg.Pool, *, session_id: str, language: str | None, profile: dict[str, Any] | None,
    satisfaction: int | None, missing_features: str | None,
) -> None:
    text = scrub((missing_features or "").strip()[:1000]) or None
    await pool.execute(
        """INSERT INTO survey_responses (session_id, profile_ref, satisfaction, missing_features, language)
           VALUES ($1, $2, $3, $4, $5)""",
        session_id, profile_ref(profile), satisfaction, text, _language(language),
    )


async def unlink_profile(pool: asyncpg.Pool, profile: dict[str, Any]) -> None:
    """On "Delete my profile": keep the anonymous counts, but cut the link to the person."""
    ref = profile_ref(profile)
    if not ref:
        return
    await pool.execute("UPDATE session_events SET profile_ref = NULL WHERE profile_ref = $1", ref)
    await pool.execute("UPDATE survey_responses SET profile_ref = NULL WHERE profile_ref = $1", ref)
