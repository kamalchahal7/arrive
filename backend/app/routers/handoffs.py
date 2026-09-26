import uuid
from datetime import date, datetime
from typing import Literal

import asyncpg
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from app.auth import Principal, require_role
from app.deps import require_db
from app.errors import AppError
from app.models.common import Lang
from app.ratelimit import limiter
from app.services import handoff

router = APIRouter(tags=["handoffs"])


class HandoffIn(BaseModel):
    need: str = Field(min_length=2, max_length=2000, description="what the person needs help with, in their words")
    language: Lang = "en"
    contact_method: Literal["phone", "text", "whatsapp", "email", "in_person"]
    contact_value: str | None = Field(default=None, max_length=200)
    preferred_time: str | None = Field(default=None, max_length=100)
    consent: bool
    profile_id: uuid.UUID | None = None
    request_id: uuid.UUID | None = None
    topic: str | None = Field(default=None, max_length=40)


@router.post("/handoffs", status_code=201)
@limiter.limit("5/minute")
async def create(request: Request, body: HandoffIn, pool: asyncpg.Pool = Depends(require_db)) -> dict[str, str]:
    if not body.consent:
        raise AppError("consent_required", 422)
    if body.contact_method != "in_person" and not (body.contact_value or "").strip():
        raise AppError("contact_required", 422)
    created = await handoff.create_handoff(
        pool, need=body.need, language=body.language, contact_method=body.contact_method,
        contact_value=body.contact_value, preferred_time=body.preferred_time, consent=True, channel="web",
        profile_id=str(body.profile_id) if body.profile_id else None, request_id=body.request_id,
        topic_hint=body.topic,
    )
    return {"id": created.id, "summary": created.summary_native, "urgency": created.urgency}


class HandoffOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    language: str
    topic: str
    summary: str
    summary_native: str | None
    already_done: str | None
    household: str | None
    status_category: str
    contact_method: str
    contact_value: str | None
    preferred_time: str | None
    status: str
    assigned_to: str | None
    urgency: str
    deadline: date | None
    channel: str
    is_sample: bool


class HandoffPatch(BaseModel):
    status: Literal["new", "in_progress", "resolved"] | None = None
    assign_to_me: bool = False


worker = APIRouter(prefix="/worker", tags=["worker"])
staff = require_role("settlement_worker")


@worker.get("/handoffs", response_model=list[HandoffOut])
async def inbox(
    status: Literal["new", "in_progress", "resolved"] | None = Query(None),
    _: Principal = Depends(staff),
    pool: asyncpg.Pool = Depends(require_db),
) -> list[HandoffOut]:
    return [HandoffOut(**h) for h in await handoff.list_handoffs(pool, status)]


@worker.get("/handoffs/{handoff_id}", response_model=HandoffOut)
async def detail(
    handoff_id: uuid.UUID, _: Principal = Depends(staff), pool: asyncpg.Pool = Depends(require_db)
) -> HandoffOut:
    h = await handoff.get_handoff(pool, handoff_id)
    if not h:
        raise AppError("not_found", 404)
    return HandoffOut(**h)


@worker.patch("/handoffs/{handoff_id}", response_model=HandoffOut)
async def update(
    handoff_id: uuid.UUID,
    body: HandoffPatch,
    principal: Principal = Depends(staff),
    pool: asyncpg.Pool = Depends(require_db),
) -> HandoffOut:
    h = await handoff.update_handoff(
        pool, handoff_id, status=body.status,
        assigned_to=(principal.email or principal.sub) if body.assign_to_me else None,
    )
    if not h:
        raise AppError("not_found", 404)
    return HandoffOut(**h)
