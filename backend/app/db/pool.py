"""asyncpg connection pool. Opened at startup, and retried lazily if the database was unreachable then."""

import asyncio
import logging
import ssl
import time

import asyncpg

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None
_dsn: str = ""
_lock = asyncio.Lock()
_last_attempt = 0.0
RETRY_SECONDS = 15


def ssl_context(dsn: str) -> ssl.SSLContext | None:
    # Tiger Cloud requires TLS. asyncpg reads sslmode from the DSN, but an explicit context
    # makes certificate verification consistent across platforms.
    if "sslmode=disable" in dsn:
        return None
    return ssl.create_default_context()


async def _init_connection(conn: asyncpg.Connection) -> None:
    # jsonb in and out as Python objects.
    import json

    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def _create() -> asyncpg.Pool | None:
    global _last_attempt
    _last_attempt = time.monotonic()
    try:
        return await asyncpg.create_pool(
            _dsn,
            min_size=1,
            max_size=10,
            command_timeout=30,
            timeout=10,
            ssl=ssl_context(_dsn),
            init=_init_connection,
        )
    except Exception as exc:
        # Start anyway so /api/health can report the problem instead of the app crash-looping.
        logger.error("could not open database pool: %s", type(exc).__name__)
        return None


async def open_pool(dsn: str) -> None:
    global _pool, _dsn
    _dsn = dsn
    if not dsn:
        logger.warning("DATABASE_URL is not set; database features are disabled")
        return
    _pool = await _create()


async def ensure_pool() -> asyncpg.Pool | None:
    """Return the pool, retrying the connection at most every RETRY_SECONDS if it is not open yet."""
    global _pool
    if _pool is not None or not _dsn:
        return _pool
    if time.monotonic() - _last_attempt < RETRY_SECONDS:
        return None
    async with _lock:
        if _pool is None:
            _pool = await _create()
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool | None:
    return _pool
