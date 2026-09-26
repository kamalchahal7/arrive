"""Apply SQL migrations in order and record them in schema_migrations.

Usage: cd backend && python -m app.db.migrate

Files may use {{EMBEDDING_DIM}} and {{REQUEST_LOG_RETENTION_DAYS}}, filled in from settings.
A file whose first line is `-- migrate: no-transaction` runs statement by statement outside a transaction
(needed for some TimescaleDB commands).
"""

import asyncio
import logging
import re
from pathlib import Path

import asyncpg

from app.config import Settings, get_settings
from app.db.pool import ssl_context

logger = logging.getLogger("arrive.migrate")

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
NO_TX_MARKER = "-- migrate: no-transaction"


def render(sql: str, settings: Settings) -> str:
    values = {
        "EMBEDDING_DIM": str(int(settings.embedding_dim)),
        "REQUEST_LOG_RETENTION_DAYS": str(int(settings.request_log_retention_days)),
    }
    return re.sub(r"\{\{(\w+)\}\}", lambda m: values[m.group(1)], sql)


def split_statements(sql: str) -> list[str]:
    """Split on semicolons at the end of a line. Good enough for our own migration files (no functions)."""
    body = "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--"))
    return [s.strip() for s in re.split(r";\s*$", body, flags=re.MULTILINE) if s.strip()]


async def apply_migrations(conn: asyncpg.Connection, settings: Settings) -> list[str]:
    await conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
    )
    applied = {r["version"] for r in await conn.fetch("SELECT version FROM schema_migrations")}
    done: list[str] = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        version = path.stem
        if version in applied:
            continue
        raw = path.read_text(encoding="utf-8")
        sql = render(raw, settings)
        logger.info("applying %s", version)
        if raw.lstrip().startswith(NO_TX_MARKER):
            for statement in split_statements(sql):
                await conn.execute(statement)
            await conn.execute("INSERT INTO schema_migrations (version) VALUES ($1)", version)
        else:
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute("INSERT INTO schema_migrations (version) VALUES ($1)", version)
        done.append(version)
    return done


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    settings = get_settings()
    conn = await asyncpg.connect(settings.database_url, ssl=ssl_context(settings.database_url), timeout=30)
    try:
        done = await apply_migrations(conn, settings)
        print(f"Applied {len(done)} migration(s): {', '.join(done) or 'none (up to date)'}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
