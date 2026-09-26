"""Shared FastAPI dependencies. Auth dependencies are added in Phase 6."""

import asyncpg

from app.db.pool import get_pool


def db_pool() -> asyncpg.Pool | None:
    return get_pool()
