"""Run ingestion from inside the backend (scheduler and admin endpoint).

A Postgres advisory lock makes sure only one worker/replica ingests at a time.
"""

import logging
import sys
from pathlib import Path
from typing import Any

import asyncpg

logger = logging.getLogger("arrive.ingest")

# The repo root (local dev) or /srv (Docker) contains the ingestion/ package.
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

LOCK_ID = 727_001  # arbitrary, app-wide constant


async def run_ingestion_locked(pool: asyncpg.Pool) -> dict[str, Any] | None:
    from ingestion.ingest import run_ingestion

    async with pool.acquire() as conn:
        if not await conn.fetchval("SELECT pg_try_advisory_lock($1)", LOCK_ID):
            return None
        try:
            report = await run_ingestion(pool)
            logger.info(
                "ingestion done fetched=%d changed=%d new=%d failed=%d",
                report.fetched, report.changed, report.new, len(report.failed),
            )
            return report.as_dict()
        finally:
            await conn.execute("SELECT pg_advisory_unlock($1)", LOCK_ID)
