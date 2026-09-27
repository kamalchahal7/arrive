"""Web voice session + server tools called by the ElevenLabs agent (web app only; there is no phone line).

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
from app.services import handoff, pii, profiles, public_id, roadmap, scam
from app.services.ask import ask
from app.services.messages import message
from app.services.request_log import log_request
from app.services.voice import VoiceError, session_credentials, speakable

router = APIRouter(tags=["voice"])



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


def _channel(value: str | None) -> str:
    # The agent only runs in the web app, so every tool call is logged as web voice.
    return "voice_web"


def _profile_id(value: str | None) -> str | None:
    """A readable ID (ARV-...) or an older uuid; anything else (e.g. an empty dynamic variable) is ignored."""
    if not value:
        return None
    if public_id.normalize(value):
        return public_id.normalize(value)
    try:
        return str(uuid.UUID(value))
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
    try:
        created = await handoff.create_handoff(
            pool, need=body.need, language=body.language or "en", contact_method=body.contact_method,
            contact_value=body.contact_value, preferred_time=body.preferred_time, consent=True,
            channel=_channel(body.channel), profile_id=_profile_id(body.profile_id),
        )
    except pii.PIIUnavailable:
        return ToolReply(text=speakable(await message("handoff_unavailable", body.language or "en")), handoff_suggested=True)
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



# ---- Household checklist tools (docs/REDESIGN.md section 8) ----

class ChecklistTool(BaseModel):
    profile_id: str | None = Field(default=None, max_length=64)
    language: str | None = Field(default=None, max_length=8)


@tools.post("/get-checklist", response_model=ToolReply)
async def tool_get_checklist(body: ChecklistTool, pool: asyncpg.Pool = Depends(require_db)) -> ToolReply:
    """What is next on the person's checklist: progress, current phase, and the next few steps (item ids included)."""
    from app.routers.checklist import get_checklist as build  # reuse the same rules and translations

    language = body.language or "en"
    pid = _profile_id(body.profile_id)
    if not pid:
        return ToolReply(text="I don't have your checklist yet. You can make one from the home screen.")
    try:
        c = await build.__wrapped__(None, profile_id=pid, lang=language, pool=pool)  # type: ignore[attr-defined]
    except AppError:
        return ToolReply(text="I could not find your checklist.")
    todo = [(p.label, r) for p in c.phases for r in p.items if r.status == "todo"]
    if not todo:
        return ToolReply(text=speakable(f"You have finished all {c.total} steps. Well done!"))
    steps = " ".join(f"{i + 1}. {r.title} ({r.person_label}) [item {r.item_id}]." for i, (_, r) in enumerate(todo[:3]))
    return ToolReply(text=f"{c.done} of {c.total} steps are done. Next: {steps}")


class ItemTool(BaseModel):
    item_id: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9_]+$")
    language: str | None = Field(default=None, max_length=8)


@tools.post("/get-item-details", response_model=ToolReply)
async def tool_get_item(body: ItemTool, pool: asyncpg.Pool = Depends(require_db)) -> ToolReply:
    """Where to go, what to bring and the steps for one checklist item or program (from the reviewed data files)."""
    from app.routers.checklist import get_item

    try:
        d = await get_item.__wrapped__(None, item_id=body.item_id, lang=body.language or "en", profile_id=None, pool=pool)  # type: ignore[attr-defined]
    except AppError:
        return ToolReply(text="I could not find that step.")
    parts = [d.title + "."]
    if d.location:
        parts.append(f"Where: {d.location.name}" + (f", {d.location.address}." if d.location.address else "."))
    if d.documents:
        parts.append("Bring: " + "; ".join(d.documents) + ".")
    if d.steps or d.how_to_apply:
        parts.append("Steps: " + " ".join(f"{i + 1}. {s}" for i, s in enumerate(d.steps or d.how_to_apply)))
    sources = [{"title": d.source.title or d.source.url, "url": d.source.url}] if d.source else []
    return ToolReply(text=" ".join(parts)[:1500], sources=sources)


class MarkDoneTool(BaseModel):
    profile_id: str | None = Field(default=None, max_length=64)
    item_id: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9_]+$")
    person_key: str | None = Field(default=None, max_length=20)
    confirmed: bool = Field(description="true only after the person clearly said yes, mark it done")


@tools.post("/mark-item-done", response_model=ToolReply)
async def tool_mark_done(body: MarkDoneTool, pool: asyncpg.Pool = Depends(require_db)) -> ToolReply:
    from app.services import checklist as engine

    if not body.confirmed:
        return ToolReply(text="Please ask the person to confirm before marking the step as done.")
    profile = await profiles.get_profile(pool, _profile_id(body.profile_id))
    if not profile:
        return ToolReply(text="I could not find your checklist.")
    rows = [r for r in engine.build_checklist(engine.Household.from_profile(profile)).rows if r.item_id == body.item_id]
    if body.person_key:
        rows = [r for r in rows if r.person.key == body.person_key]
    if not rows:
        return ToolReply(text="That step is not on your checklist.")
    for r in rows:
        await pool.execute(
            """INSERT INTO checklist_progress (profile_id, item_id, person_key, status, completed_at, updated_at)
               VALUES ($1, $2, $3, 'done', now(), now())
               ON CONFLICT (profile_id, item_id, person_key) DO UPDATE SET status = 'done',
                   completed_at = COALESCE(checklist_progress.completed_at, now()), updated_at = now()""",
            profile["id"], r.item_id, r.person.key,
        )
    return ToolReply(text=f"Done. I marked it as done on your checklist ({len(rows)}).")
