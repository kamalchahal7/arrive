"""Database connections. Every connection (API pool, migrations, ingestion, scripts) goes through this module so
TLS follows the DSN's sslmode the same way everywhere (see app/db/tls.py)."""

import asyncio
import json
import logging
import time

import asyncpg

from app.config import Settings
from app.db.tls import ssl_context

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None
_dsn: str = ""
_root_cert: str | None = None
_lock = asyncio.Lock()
_last_attempt = 0.0
RETRY_SECONDS = 15


def ssl_for(settings: Settings) -> object:
    """asyncpg `ssl=` value for these settings."""
    return ssl_context(settings.database_url, settings.db_ssl_root_cert or None)


async def _init_connection(conn: asyncpg.Connection) -> None:
    # jsonb in and out as Python objects.
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def connect(settings: Settings, *, timeout: float = 30) -> asyncpg.Connection:
    """A single connection for command-line tools (migrations, ingestion, seeding)."""
    conn = await asyncpg.connect(settings.database_url, ssl=ssl_for(settings), timeout=timeout)
    await _init_connection(conn)
    return conn


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
            ssl=ssl_context(_dsn, _root_cert),
            init=_init_connection,
        )
    except Exception as exc:
        # Start anyway so /api/health can report the problem instead of the app crash-looping.
        logger.error("could not open database pool: %s: %s", type(exc).__name__, exc)
        return None


async def open_pool(settings: Settings) -> None:
    global _pool, _dsn, _root_cert
    _dsn = settings.database_url
    _root_cert = settings.db_ssl_root_cert or None
    if not _dsn:
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
