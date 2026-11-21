import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.core.config import get_settings
from app.core.db import dispose_engine
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware, SecurityHeadersMiddleware
from app.core.telemetry import setup_telemetry
from app.modules.admin import router as admin_router
from app.modules.assistant import router as assistant_router
from app.modules.auth import router as auth_router
from app.modules.bookings import admin_router as bookings_admin_router
from app.modules.bookings import router as bookings_router
from app.modules.courses import admin_router as courses_admin_router
from app.modules.courses import router as courses_router
from app.modules.notifications import router as notifications_router
from app.modules.payments import router as payments_router
from app.modules.users import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    structlog.get_logger().info("startup", event_name="startup")
    stop = asyncio.Event()
    embedded: asyncio.Task[None] | None = None
    if get_settings().embedded_worker:
        from app.worker.__main__ import worker_loop

        embedded = asyncio.create_task(worker_loop(stop))
    yield
    stop.set()
    if embedded is not None:
        await embedded
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    app = FastAPI(
        title="Tallerya API",
        version="0.1.0",
        description="API de Tallerya: talleres presenciales, reservas y pagos.",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Idempotency-Key", "X-Request-ID", "X-CSRF-Token"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)
    setup_telemetry(app)
    app.include_router(health.router)
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(auth_router.router)
    api_v1.include_router(users_router.router)
    api_v1.include_router(courses_router.router)
    api_v1.include_router(admin_router.router)
    api_v1.include_router(courses_admin_router.router)
    api_v1.include_router(bookings_router.router)
    api_v1.include_router(bookings_admin_router.router)
    api_v1.include_router(payments_router.router)
    api_v1.include_router(notifications_router.router)
    api_v1.include_router(assistant_router.router)
    api_v1.include_router(payments_router.admin_router)
    if payments_router.dev_enabled():
        api_v1.include_router(payments_router.dev_router)
    app.include_router(api_v1)
    return app


app = create_app()
