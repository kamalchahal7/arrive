from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, Query

from app.auth import Principal, require_role
from app.deps import require_db
from app.services import household_insights, insights

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


# ---- Redesign (docs/REDESIGN.md section 9) ----


@router.get("/programs")
async def program_interest(
    weeks: int = Query(12, ge=2, le=52), _: Principal = Depends(analyst), pool: asyncpg.Pool = Depends(require_db)
) -> dict[str, Any]:
    return await household_insights.program_interest(pool, weeks)


@router.get("/checklist")
async def checklist(
    weeks: int = Query(12, ge=2, le=52), _: Principal = Depends(analyst), pool: asyncpg.Pool = Depends(require_db)
) -> dict[str, Any]:
    return {
        **await household_insights.checklist_bottlenecks(pool, weeks),
        "essential_times": (await household_insights.essential_times(pool))["items"],
    }


@router.get("/survey")
async def survey(
    weeks: int = Query(12, ge=2, le=52), _: Principal = Depends(analyst), pool: asyncpg.Pool = Depends(require_db)
) -> dict[str, Any]:
    return await household_insights.survey(pool, weeks)
