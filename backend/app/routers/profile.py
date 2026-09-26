import uuid

import asyncpg
from fastapi import APIRouter, Depends, Request

from app.deps import require_db
from app.errors import AppError
from app.models.profile import ProfileIn, ProfileOut
from app.ratelimit import PUBLIC, limiter
from app.services import profiles

router = APIRouter(tags=["profile"])


@router.post("/profile", response_model=ProfileOut, status_code=201)
@limiter.limit("10/minute")
async def create(request: Request, body: ProfileIn, pool: asyncpg.Pool = Depends(require_db)) -> ProfileOut:
    row = await profiles.create_profile(pool, body.model_dump(exclude_none=True))
    return ProfileOut(**row)


@router.get("/profile/{profile_id}", response_model=ProfileOut)
@limiter.limit(PUBLIC)
async def read(request: Request, profile_id: uuid.UUID, pool: asyncpg.Pool = Depends(require_db)) -> ProfileOut:
    row = await profiles.get_profile(pool, profile_id)
    if not row:
        raise AppError("profile_not_found", 404)
    return ProfileOut(**row)


@router.patch("/profile/{profile_id}", response_model=ProfileOut)
@limiter.limit(PUBLIC)
async def update(
    request: Request, profile_id: uuid.UUID, body: ProfileIn, pool: asyncpg.Pool = Depends(require_db)
) -> ProfileOut:
    row = await profiles.update_profile(pool, profile_id, body.model_dump(exclude_unset=True))
    if not row:
        raise AppError("profile_not_found", 404)
    return ProfileOut(**row)


@router.delete("/profile/{profile_id}", status_code=204)
@limiter.limit(PUBLIC)
async def delete(request: Request, profile_id: uuid.UUID, pool: asyncpg.Pool = Depends(require_db)) -> None:
    # Deletes the profile and, by cascade, its roadmap steps and reminders.
    await profiles.delete_profile(pool, profile_id)
