"""Voice onboarding answers (docs/REDESIGN.md section 4.2). Needs no database and stores nothing."""

from typing import Any

from fastapi import APIRouter, File, Form, Request, UploadFile
from pydantic import BaseModel

from app.errors import AppError
from app.ratelimit import limiter
from app.services import onboarding, speech

router = APIRouter(tags=["onboarding"])


class AnswerOut(BaseModel):
    question_key: str
    understood: bool
    declined: bool
    value: dict[str, Any]
    confirmation: str
    heard: str  # what speech-to-text heard, shown so the person can check it; never stored


@router.post("/onboarding/answer", response_model=AnswerOut)
@limiter.limit("20/minute")
async def answer(
    request: Request,
    question_key: onboarding.QuestionKey = Form(...),
    language: str = Form("en", min_length=2, max_length=8, pattern=r"^[a-zA-Z-]+$"),
    audio: UploadFile | None = File(None),
    text: str | None = Form(None, max_length=onboarding.MAX_TEXT),
) -> AnswerOut:
    if audio is None and not (text or "").strip():
        raise AppError("answer_required", 422)
    heard = (text or "").strip()
    if audio is not None:
        # Held in memory only, and dropped as soon as it is transcribed.
        data = await audio.read(speech.MAX_AUDIO_BYTES + 1)
        await audio.close()
        if len(data) > speech.MAX_AUDIO_BYTES:
            raise AppError("audio_too_large", 413)
        mime = speech.sniff_audio(data)
        if mime is None or len(data) < speech.MIN_AUDIO_BYTES:
            raise AppError("unsupported_audio", 415)
        try:
            heard = await speech.transcribe(data, mime, language)
        except speech.SpeechError as exc:
            code = str(exc)
            raise AppError(code, 422 if code == "stt_unsupported_language" else 503) from exc
        finally:
            del data
    result = await onboarding.understand(question_key, heard, language)
    return AnswerOut(
        question_key=result.question_key, understood=result.understood, declined=result.declined, value=result.value,
        confirmation=result.confirmation, heard=heard,
    )
