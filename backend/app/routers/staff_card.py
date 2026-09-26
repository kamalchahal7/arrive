import dataclasses
import uuid
from typing import Any, Literal

import asyncpg
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.deps import require_db
from app.errors import AppError
from app.models.common import Lang
from app.ratelimit import PUBLIC, limiter
from app.services.staff_card import build_card

router = APIRouter(tags=["staff-card"])


class StaffCardIn(BaseModel):
    step_id: uuid.UUID | None = None
    template_id: str | None = Field(default=None, max_length=60)
    language: Lang = "en"
    official_language: Literal["en", "fr"] = "en"


@router.post("/staff-card")
@limiter.limit(PUBLIC)
async def staff_card(request: Request, body: StaffCardIn, pool: asyncpg.Pool = Depends(require_db)) -> dict[str, Any]:
    card = await build_card(
        pool, step_id=body.step_id, template_id=body.template_id, language=body.language,
        official=body.official_language,
    )
    if not card:
        raise AppError("step_not_found", 404)
    official, native = card
    return {"official": dataclasses.asdict(official), "native": dataclasses.asdict(native)}
