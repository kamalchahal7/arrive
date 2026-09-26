import asyncio

import asyncpg
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.deps import db_pool

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(pool: asyncpg.Pool | None = Depends(db_pool)) -> JSONResponse:
    db_ok = False
    if pool is not None:
        try:
            async with asyncio.timeout(5):
                db_ok = await pool.fetchval("SELECT 1") == 1
        except Exception:
            db_ok = False
    body = {"status": "ok" if db_ok else "degraded", "db": "ok" if db_ok else "unavailable"}
    return JSONResponse(body, status_code=200 if db_ok else 503)
