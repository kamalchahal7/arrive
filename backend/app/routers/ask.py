import asyncpg
from fastapi import APIRouter, Depends, Request

from app.deps import require_db
from app.errors import AppError
from app.models.ask import AskRequest, AskResponse, FeedbackRequest
from app.models.common import dedupe_sources
from app.ratelimit import PUBLIC, limiter
from app.services import request_log
from app.services.ask import ask
from app.services.messages import message

router = APIRouter(tags=["ask"])


@router.post("/ask", response_model=AskResponse)
@limiter.limit(PUBLIC)
async def ask_endpoint(request: Request, body: AskRequest, pool: asyncpg.Pool = Depends(require_db)) -> AskResponse:
    r = await ask(pool, body.question, ui_language=body.language, profile_id=str(body.profile_id or ""), channel="web")
    return AskResponse(
        request_id=r.request_id,
        status=r.status,
        language=r.language,
        topic=r.topic,
        urgency=r.urgency,  # type: ignore[arg-type]
        emergency=r.emergency,
        emergency_message=r.emergency_message,
        possible_scam=r.possible_scam,
        answer=r.answer,
        steps=r.steps,
        sources=dedupe_sources(r.sources),
        follow_ups=r.follow_ups,
        message=r.message,
        handoff_suggested=r.handoff_suggested,
        handoff_reason=r.handoff_reason,  # type: ignore[arg-type]
        disclaimer=await message("disclaimer", r.language) if r.status == "answered" else None,
    )


@router.post("/feedback", status_code=204)
@limiter.limit(PUBLIC)
async def feedback(request: Request, body: FeedbackRequest, pool: asyncpg.Pool = Depends(require_db)) -> None:
    if not await request_log.set_clarity(pool, body.request_id, body.clarity):
        raise AppError("not_found", status_code=404)
