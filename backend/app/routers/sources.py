from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, Request

from app.deps import require_db
from app.ratelimit import PUBLIC, limiter

router = APIRouter(tags=["sources"])


@router.get("/sources")
@limiter.limit(PUBLIC)
async def list_sources(request: Request, pool: asyncpg.Pool = Depends(require_db)) -> list[dict[str, Any]]:
    """The official pages Arrive answers from, with when each was last checked and last changed."""
    rows = await pool.fetch(
        """SELECT s.title, s.url, s.jurisdiction, s.topics, s.last_fetched_at, s.last_changed_at,
                  (SELECT count(*) FROM source_chunks c WHERE c.source_id = s.id)::int AS passages
           FROM sources s WHERE s.active ORDER BY s.jurisdiction, s.title"""
    )
    return [dict(r) for r in rows]
