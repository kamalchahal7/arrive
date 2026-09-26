"""FastAPI app factory. All routes live under /api so Caddy can route by prefix."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.db.pool import close_pool, ensure_pool, get_pool, open_pool
from app.errors import AppError
from app.ratelimit import limiter
from app.routers import admin, ask, handoffs, health, insights, media, profile, roadmap, staff_card, voice
from app.services.gemini import GeminiError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("arrive")
# httpx logs full URLs at INFO; keep them out of the logs.
logging.getLogger("httpx").setLevel(logging.WARNING)


async def _daily_ingest() -> None:
    from app.services.ingestion_runner import run_ingestion_locked

    pool = await ensure_pool()
    if pool is None:
        logger.warning("scheduled ingestion skipped: database unavailable")
        return
    await run_ingestion_locked(pool)


async def _startup_sync() -> None:
    from app.services.roadmap import sync_templates

    pool = get_pool()
    if pool is None:
        return
    try:
        logger.info("synced %d step templates", await sync_templates(pool))
    except Exception as exc:
        # Before migrations run the tables don't exist yet; that is fine.
        logger.warning("step template sync skipped: %s", type(exc).__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    await open_pool(settings.database_url)
    await _startup_sync()
    scheduler: AsyncIOScheduler | None = None
    if settings.scheduler_enabled:
        scheduler = AsyncIOScheduler(timezone="UTC")
        scheduler.add_job(_daily_ingest, "cron", hour=settings.ingest_hour_utc, minute=0, id="daily_ingest")
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)
    await close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Arrive API", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.limiter = limiter

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Arrive-Secret"],
    )

    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse({"error": exc.code}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def invalid(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Field names only; never echo the submitted values back.
        fields = sorted({".".join(str(p) for p in e.get("loc", [])[1:]) for e in exc.errors()})
        return JSONResponse({"error": "invalid_input", "fields": fields}, status_code=422)

    @app.exception_handler(RateLimitExceeded)
    async def rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse({"error": "rate_limited"}, status_code=429)

    @app.exception_handler(GeminiError)
    async def ai_down(request: Request, exc: GeminiError) -> JSONResponse:
        logger.error("gemini error on %s", request.url.path)
        return JSONResponse({"error": "ai_unavailable"}, status_code=503)

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Log the type and path only: never user content, never a stack trace to the client.
        logger.error("unhandled error %s on %s", type(exc).__name__, request.url.path)
        return JSONResponse({"error": "internal_error"}, status_code=500)

    for r in (
        health.router, ask.router, profile.router, roadmap.router, staff_card.router, media.router,
        handoffs.router, handoffs.worker, insights.router, voice.router, voice.tools, admin.router,
    ):
        app.include_router(r, prefix="/api")
    return app


app = create_app()
