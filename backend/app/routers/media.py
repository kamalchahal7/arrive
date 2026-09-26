"""Read-aloud, letter decoder and scam check."""

import uuid
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.deps import require_db
from app.errors import AppError
from app.models.common import Lang, dedupe_sources
from app.ratelimit import PUBLIC, STRICT, limiter
from app.services import letters, scam
from app.services.messages import message
from app.services.tts import MAX_CHARS, TTSError, synthesize

router = APIRouter(tags=["media"])


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    language: Lang = "en"


@router.post("/tts", response_class=Response)
@limiter.limit(STRICT)
async def tts(request: Request, body: TTSIn, pool: asyncpg.Pool = Depends(require_db)) -> Response:
    try:
        audio = await synthesize(pool, body.text)
    except TTSError as exc:
        raise AppError(str(exc), 503) from exc
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400"})


@router.post("/letters/decode")
@limiter.limit(STRICT)
async def decode_letter(
    request: Request,
    file: UploadFile = File(...),
    language: str = Form("en", min_length=2, max_length=8, pattern=r"^[a-zA-Z-]+$"),
    profile_id: uuid.UUID | None = Form(None),
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
        out = await letters.decode(pool, data, mime, language, profile_id=str(profile_id) if profile_id else None)
    finally:
        del data
    return {**out.model_dump(), "disclaimer": await message("disclaimer", language)}


class ScamIn(BaseModel):
    description: str = Field(min_length=5, max_length=2000)
    language: Lang = "en"
    profile_id: uuid.UUID | None = None


@router.post("/scam-check")
@limiter.limit(PUBLIC)
async def scam_check(request: Request, body: ScamIn, pool: asyncpg.Pool = Depends(require_db)) -> dict[str, Any]:
    r = await scam.check(
        pool, body.description, body.language, profile_id=str(body.profile_id) if body.profile_id else None
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
