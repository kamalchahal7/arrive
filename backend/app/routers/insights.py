from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.auth import Principal, require_role
from app.deps import require_db
from app.services import insights

router = APIRouter(prefix="/insights", tags=["insights"])
analyst = require_role("gov_analyst")


@router.get("/overview")
async def overview(_: Principal = Depends(analyst), pool: asyncpg.Pool = Depends(require_db)) -> dict[str, Any]:
    return await insights.overview(pool)


@router.get("/over-time")
async def over_time(
    weeks: int = Query(8, ge=2, le=52), _: Principal = Depends(analyst), pool: asyncpg.Pool = Depends(require_db)
) -> dict[str, Any]:
    return await insights.over_time(pool, weeks)


@router.get("/languages")
async def languages(
    weeks: int = Query(8, ge=2, le=52), _: Principal = Depends(analyst), pool: asyncpg.Pool = Depends(require_db)
) -> dict[str, Any]:
    return await insights.language_demand(pool, weeks)


@router.get("/gaps")
async def gaps(
    days: int = Query(30, ge=7, le=365), _: Principal = Depends(analyst), pool: asyncpg.Pool = Depends(require_db)
) -> dict[str, Any]:
    return await insights.knowledge_gaps(pool, days)


@router.get("/confusing-sources")
async def confusing(
    days: int = Query(30, ge=7, le=365), _: Principal = Depends(analyst), pool: asyncpg.Pool = Depends(require_db)
) -> dict[str, Any]:
    return await insights.confusing_sources(pool, days)


@router.post("/brief")
async def brief(_: Principal = Depends(analyst), pool: asyncpg.Pool = Depends(require_db)) -> dict[str, Any]:
    return await insights.brief(pool)
