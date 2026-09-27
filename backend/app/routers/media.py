"""Read-aloud, letter decoder and scam check."""

from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.deps import db_pool, require_db
from app.errors import AppError
from app.models.common import Lang, ProfileRef, dedupe_sources
from app.ratelimit import PUBLIC, STRICT, limiter
from app.services import letters, scam
from app.services.messages import message
from app.services.tts import MAX_CHARS, TTSError, synthesize

router = APIRouter(tags=["media"])


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    language: Lang = "en"


@router.post("/tts", response_class=Response)
@limiter.limit("30/minute")  # onboarding reads each question and confirmation aloud
async def tts(request: Request, body: TTSIn, pool: asyncpg.Pool | None = Depends(db_pool)) -> Response:
    try:
        audio = await synthesize(pool, body.text, body.language)
    except TTSError as exc:
        # A language with no read-aloud is not an outage: 422 tells the app to stay in text mode.
        raise AppError(str(exc), 422 if str(exc) == "tts_unsupported_language" else 503) from exc
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400"})


@router.post("/letters/decode")
@limiter.limit(STRICT)
async def decode_letter(
    request: Request,
    file: UploadFile = File(...),
    language: str = Form("en", min_length=2, max_length=8, pattern=r"^[a-zA-Z-]+$"),
    profile_id: str | None = Form(None, min_length=12, max_length=40, pattern=r"^[A-Za-z0-9 _.-]+$"),
    pool: asyncpg.Pool = Depends(require_db),
) -> dict[str, Any]:
    # Read into memory only. The bytes are never written to disk or the database.
    data = await file.read(letters.MAX_BYTES + 1)
    await file.close()
    if len(data) > letters.MAX_BYTES:
        raise AppError("file_too_large", 413)
    mime = letters.sniff_type(data, file.content_type)
    if mime not in letters.ALLOWED_TYPES:
        raise AppError("unsupported_file", 415)
    try:
        out = await letters.decode(pool, data, mime, language, profile_id=profile_id)
    finally:
        del data
    return {**out.model_dump(), "disclaimer": await message("disclaimer", language)}


class ScamIn(BaseModel):
    description: str = Field(min_length=5, max_length=2000)
    language: Lang = "en"
    profile_id: ProfileRef | None = None


@router.post("/scam-check")
@limiter.limit(PUBLIC)
async def scam_check(request: Request, body: ScamIn, pool: asyncpg.Pool = Depends(require_db)) -> dict[str, Any]:
    r = await scam.check(
        pool, body.description, body.language, profile_id=body.profile_id
    )
    return {
        "request_id": r.request_id,
        "verdict": r.verdict,
        "verdict_text": await message(f"scam_{r.verdict}", body.language),
        "reasons": r.reasons,
        "what_to_do": r.what_to_do,
        "government_never": r.government_never,
        "sources": [s.model_dump(mode="json") for s in dedupe_sources(r.sources)],
        "report_url": r.report_url,
    }
