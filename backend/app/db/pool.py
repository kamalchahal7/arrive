"""asyncpg connection pool, opened and closed by the app lifespan."""

import logging
import ssl

import asyncpg

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


def _ssl_context(dsn: str) -> ssl.SSLContext | None:
    # Tiger Cloud requires TLS. asyncpg reads sslmode from the DSN, but an explicit context
    # makes certificate verification consistent across platforms.
    if "sslmode=disable" in dsn:
        return None
    return ssl.create_default_context()


async def open_pool(dsn: str) -> None:
    global _pool
    if not dsn:
        logger.warning("DATABASE_URL is not set; database features are disabled")
        return
    try:
        _pool = await asyncpg.create_pool(
            dsn, min_size=1, max_size=10, command_timeout=30, ssl=_ssl_context(dsn)
        )
    except Exception:
        # Start anyway so /api/health can report the problem instead of the app crash-looping.
        logger.exception("could not open database pool")
        _pool = None


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool | None:
    return _pool
