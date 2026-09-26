import dataclasses
import uuid

import asyncpg
from fastapi import APIRouter, Depends, Query, Request

from app.deps import require_db
from app.errors import AppError
from app.models.common import Lang
from app.models.profile import CustomStepIn, RoadmapOut, StepOut, StepPatch, StepSource
from app.ratelimit import PUBLIC, limiter
from app.services import profiles, roadmap

router = APIRouter(tags=["roadmap"])


def step_out(s: roadmap.RoadmapStep) -> StepOut:
    data = dataclasses.asdict(s)
    source = (
        StepSource(url=s.source_url, title=s.source_title, last_checked=s.source_last_checked) if s.source_url else None
    )
    for k in ("source_url", "source_title", "source_last_checked"):
        data.pop(k)
    return StepOut(**data, source=source)


@router.get("/roadmap/{profile_id}", response_model=RoadmapOut)
@limiter.limit(PUBLIC)
async def get_roadmap(
    request: Request, profile_id: uuid.UUID, lang: Lang = Query("en"), pool: asyncpg.Pool = Depends(require_db)
) -> RoadmapOut:
    profile = await profiles.get_profile(pool, profile_id)
    if not profile:
        raise AppError("profile_not_found", 404)
    r = await roadmap.build_roadmap(pool, profile, lang)
    return RoadmapOut(
        profile_id=r.profile_id, language=r.language, weeks_since_arrival=r.weeks_since_arrival,
        done=r.done, total=r.total, steps=[step_out(s) for s in r.steps],
    )


@router.patch("/roadmap/steps/{step_id}", status_code=204)
@limiter.limit(PUBLIC)
async def patch_step(
    request: Request, step_id: uuid.UUID, body: StepPatch, pool: asyncpg.Pool = Depends(require_db)
) -> None:
    if not await roadmap.set_step_status(pool, step_id, body.status):
        raise AppError("step_not_found", 404)


@router.post("/roadmap/{profile_id}/custom", status_code=201)
@limiter.limit(PUBLIC)
async def add_custom(
    request: Request, profile_id: uuid.UUID, body: CustomStepIn, pool: asyncpg.Pool = Depends(require_db)
) -> dict[str, str]:
    if not await profiles.get_profile(pool, profile_id):
        raise AppError("profile_not_found", 404)
    return {"id": await roadmap.add_custom_step(pool, profile_id, body.title, body.due_date, body.note)}
