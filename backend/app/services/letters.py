"""Letter decoder. The file is read into memory, sent to Gemini, and discarded: never written to disk or the DB."""

from datetime import datetime, timezone
from typing import Literal

import asyncpg
from google.genai import types
from pydantic import BaseModel, Field

from app import prompts
from app.services import gemini, request_log
from app.services.privacy import scrub
from app.services.profiles import get_profile, region_of
from app.services.topics import clean_topic, language_name, topic_ids

MAX_BYTES = 10 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/heic", "image/heif", "application/pdf"}


class LetterOut(BaseModel):
    sender: str
    sender_confidence: Literal["high", "medium", "low"]
    what_it_means: str
    action_needed: bool
    deadline: str | None = None
    deadline_iso: str | None = None
    steps: list[str] = Field(default_factory=list)
    amount_owed: str | None = None
    looks_suspicious: bool = False
    suspicious_reasons: list[str] = Field(default_factory=list)
    topic: str = "other"
    short_title: str = ""


def sniff_type(data: bytes, declared: str | None) -> str | None:
    """Trust the file's magic bytes, not only the declared content type."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data[4:12] in (b"ftypheic", b"ftypheix", b"ftyphevc", b"ftypmif1", b"ftypmsf1", b"ftypheif"):
        return "image/heic" if declared != "image/heif" else "image/heif"
    return None


async def decode(
    pool: asyncpg.Pool, data: bytes, mime_type: str, language: str, *, profile_id: str | None = None
) -> LetterOut:
    prompt = prompts.render(
        "letter", language=language_name(language), today=datetime.now(timezone.utc).date().isoformat(),
        topics=", ".join(sorted(topic_ids())),
    )
    out = await gemini.get_gemini().generate_json(
        "letter_decode",
        [types.Part.from_bytes(data=data, mime_type=mime_type), prompt],
        LetterOut,
        vision=True,
        temperature=0.1,
        timeout=60,
    )
    out.topic = clean_topic(out.topic)
    # Belt and braces: strip anything that looks like personal data from the explanation.
    out.what_it_means = scrub(out.what_it_means) or ""
    out.steps = [scrub(s) or "" for s in out.steps][:4]
    profile = await get_profile(pool, profile_id)
    # Only the topic, language and channel are logged, never the letter's content.
    await request_log.log_request(
        pool, channel="web", kind="letter", language=language, topic=out.topic,
        status_category=(profile or {}).get("status"), region=region_of(profile),
        answered=True, scam_flag=out.looks_suspicious,
    )
    return out
