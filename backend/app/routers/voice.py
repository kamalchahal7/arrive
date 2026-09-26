"""Web voice session + server tools called by the ElevenLabs agent (web and phone).

Tool calls must carry the header X-Arrive-Secret: VOICE_TOOL_SECRET. Responses are short, speakable text.
"""

import hmac
import uuid
from typing import Literal

import asyncpg
from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field

from app.config import get_settings
from app.deps import require_db
from app.errors import AppError
from app.models.common import Lang, dedupe_sources
from app.ratelimit import limiter
from app.services import handoff, profiles, roadmap, scam
from app.services.ask import ask
from app.services.messages import message
from app.services.request_log import log_request
from app.services.voice import VoiceError, session_credentials, speakable

router = APIRouter(tags=["voice"])

VoiceChannel = Literal["voice_web", "phone"]


@router.get("/voice/session")
@limiter.limit("10/minute")
async def voice_session(request: Request) -> dict[str, str]:
    try:
        return await session_credentials()
    except VoiceError as exc:
        raise AppError(str(exc), 503) from exc


def require_tool_secret(x_arrive_secret: str | None = Header(default=None)) -> None:
    expected = get_settings().voice_tool_secret
    if not expected or not x_arrive_secret or not hmac.compare_digest(x_arrive_secret, expected):
        raise AppError("unauthorized", 401)


tools = APIRouter(prefix="/voice/tools", tags=["voice-tools"], dependencies=[Depends(require_tool_secret)])


def _channel(value: str | None) -> VoiceChannel:
    return "voice_web" if value == "voice_web" else "phone"


def _profile_id(value: str | None) -> str | None:
    try:
        return str(uuid.UUID(value)) if value else None
    except ValueError:
        return None


class ToolReply(BaseModel):
    text: str
    sources: list[dict[str, str]] = []
    handoff_suggested: bool = False


class AskTool(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    language: str | None = Field(default=None, max_length=8)
    channel: str | None = Field(default=None, max_length=20)
    profile_id: str | None = Field(default=None, max_length=64)


@tools.post("/ask", response_model=ToolReply)
async def tool_ask(body: AskTool, pool: asyncpg.Pool = Depends(require_db)) -> ToolReply:
    r = await ask(
        pool, body.question, ui_language=body.language or "en", profile_id=_profile_id(body.profile_id),
        channel=_channel(body.channel), style="voice",
    )
    sources = dedupe_sources(r.sources)
    names = ", ".join(s.title for s in sources[:2])
    return ToolReply(
        text=speakable(r.emergency_message, r.answer or r.message, f"Source: {names}." if names else None),
        sources=[{"title": s.title, "url": s.url} for s in sources],
        handoff_suggested=r.handoff_suggested,
    )


class RoadmapTool(BaseModel):
    language: str | None = Field(default=None, max_length=8)
    channel: str | None = Field(default=None, max_length=20)
    profile_id: str | None = Field(default=None, max_length=64)
    status: Literal["refugee_pr", "international_student", "unknown"] | None = None
    has_children: bool | None = None


@tools.post("/roadmap", response_model=ToolReply)
async def tool_roadmap(body: RoadmapTool, pool: asyncpg.Pool = Depends(require_db)) -> ToolReply:
    language = body.language or "en"
    profile = await profiles.get_profile(pool, _profile_id(body.profile_id))
    if profile:
        rm = await roadmap.build_roadmap(pool, profile, language)
        titles = [s.title for s in rm.steps if s.status == "todo"][:3]
    else:
        preview = await roadmap.preview_steps(
            pool,
            {"status": body.status or "unknown", "city": "ottawa", "province": "ontario", "has_children": body.has_children},
            language,
        )
        titles = [p["title"] for p in preview]
    await log_request(
        pool, channel=_channel(body.channel), kind="roadmap", language=language, topic="other",
        status_category=(profile or {}).get("status") or body.status, answered=bool(titles),
    )
    if not titles:
        return ToolReply(text=speakable(await message("not_found", language)), handoff_suggested=True)
    numbered = " ".join(f"{i + 1}. {t}." for i, t in enumerate(titles))
    return ToolReply(text=speakable(numbered))


class HandoffTool(BaseModel):
    need: str = Field(min_length=2, max_length=2000)
    language: str | None = Field(default=None, max_length=8)
    channel: str | None = Field(default=None, max_length=20)
    contact_method: Literal["phone", "text", "whatsapp", "email", "in_person"] = "phone"
    contact_value: str | None = Field(default=None, max_length=200)
    preferred_time: str | None = Field(default=None, max_length=100)
    consent: bool
    profile_id: str | None = Field(default=None, max_length=64)


@tools.post("/handoff", response_model=ToolReply)
async def tool_handoff(body: HandoffTool, pool: asyncpg.Pool = Depends(require_db)) -> ToolReply:
    if not body.consent:
        return ToolReply(text="I need your permission before I share your request with a settlement worker.")
    created = await handoff.create_handoff(
        pool, need=body.need, language=body.language or "en", contact_method=body.contact_method,
        contact_value=body.contact_value, preferred_time=body.preferred_time, consent=True,
        channel=_channel(body.channel), profile_id=_profile_id(body.profile_id),
    )
    return ToolReply(text=speakable(created.summary_native))


class ScamTool(BaseModel):
    description: str = Field(min_length=2, max_length=2000)
    language: str | None = Field(default=None, max_length=8)
    channel: str | None = Field(default=None, max_length=20)


@tools.post("/scam-check", response_model=ToolReply)
async def tool_scam(body: ScamTool, pool: asyncpg.Pool = Depends(require_db)) -> ToolReply:
    r = await scam.check(pool, body.description, body.language or "en", channel=_channel(body.channel))
    sources = dedupe_sources(r.sources)
    return ToolReply(
        text=speakable(
            await message(f"scam_{r.verdict}", body.language or "en"), " ".join(r.reasons[:2]), " ".join(r.what_to_do[:2])
        ),
        sources=[{"title": s.title, "url": s.url} for s in sources],
        handoff_suggested=r.verdict != "likely_real",
    )

