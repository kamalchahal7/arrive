from typing import Any

import asyncpg
from fastapi import APIRouter, Depends

from app.auth import Principal, require_role
from app.deps import require_db
from app.services.ingestion_runner import run_ingestion_locked

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/ingest")
async def ingest(_: Principal = Depends(require_role("admin")), pool: asyncpg.Pool = Depends(require_db)) -> dict[str, Any]:
    report = await run_ingestion_locked(pool)
    if report is None:
        return {"status": "already_running"}
    return {"status": "done", **report}
