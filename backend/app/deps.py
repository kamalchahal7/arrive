"""Shared FastAPI dependencies."""

import asyncpg

from app.db.pool import ensure_pool
from app.errors import AppError


async def db_pool() -> asyncpg.Pool | None:
    return await ensure_pool()


async def require_db() -> asyncpg.Pool:
    pool = await ensure_pool()
    if pool is None:
        raise AppError("db_unavailable", status_code=503)
    return pool
