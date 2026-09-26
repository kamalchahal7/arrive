"""FastAPI app factory. All routes live under /api so Caddy can route by prefix."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db.pool import close_pool, open_pool
from app.routers import health

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("arrive")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await open_pool(get_settings().database_url)
    yield
    await close_pool()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Arrive API", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Arrive-Secret"],
    )

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Log the type and path only: never user content, never a stack trace to the client.
        logger.error("unhandled error %s on %s", type(exc).__name__, request.url.path)
        return JSONResponse({"error": "internal_error"}, status_code=500)

    app.include_router(health.router, prefix="/api")
    return app


app = create_app()
