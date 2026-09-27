"""Session events and the end-of-session survey (docs/REDESIGN.md sections 9 and 10)."""

import asyncpg
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from pydantic import BaseModel, Field

from app.deps import require_db
from app.errors import AppError
from app.models.common import Lang, ProfileRef
from app.ratelimit import limiter
from app.services import events, profiles, speech

router = APIRouter(tags=["events"])

SessionId = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class EventIn(BaseModel):
    session_id: str = SessionId
    event: str = Field(max_length=40)
    target_id: str | None = Field(default=None, max_length=60)
    language: Lang = "en"
    profile_id: ProfileRef | None = None


@router.post("/events", status_code=204)
@limiter.limit("60/minute")
async def log(request: Request, body: EventIn, pool: asyncpg.Pool = Depends(require_db)) -> None:
    if body.event not in events.EVENTS:
        raise AppError("invalid_input", 422)
    profile = await profiles.get_profile(pool, body.profile_id) if body.profile_id else None
    await events.log_event(
        pool, session_id=body.session_id, event=body.event, language=body.language, profile=profile,
        target_id=body.target_id,
    )


@router.post("/survey", status_code=204)
@limiter.limit("10/minute")
async def survey(
    request: Request,
    session_id: str = Form(..., min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"),
    language: str = Form("en", min_length=2, max_length=8, pattern=r"^[a-zA-Z-]+$"),
    profile_id: str | None = Form(None, min_length=12, max_length=40),
    satisfaction: int | None = Form(None, ge=1, le=5),
    missing_features: str | None = Form(None, max_length=1000),
    audio: UploadFile | None = File(None),
    pool: asyncpg.Pool = Depends(require_db),
) -> None:
    text = missing_features
    if audio is not None:
        # The spoken answer is transcribed in memory, scrubbed, and only the text is kept.
        data = await audio.read(speech.MAX_AUDIO_BYTES + 1)
        await audio.close()
        mime = speech.sniff_audio(data)
        if len(data) > speech.MAX_AUDIO_BYTES or mime is None:
            raise AppError("unsupported_audio", 415)
        try:
            text = await speech.transcribe(data, mime, language)
        except speech.SpeechError as exc:
            raise AppError(str(exc), 503) from exc
        finally:
            del data
    if satisfaction is None and not (text or "").strip():
        raise AppError("answer_required", 422)
    profile = await profiles.get_profile(pool, profile_id) if profile_id else None
    await events.save_survey(
        pool, session_id=session_id, language=language, profile=profile, satisfaction=satisfaction,
        missing_features=text,
    )
