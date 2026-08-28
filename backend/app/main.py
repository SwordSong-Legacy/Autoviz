"""FastAPI application entry point."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings

# Configure logging so logger.info() and below appear in console
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
# Suppress SQLAlchemy engine SQL query logs (INFO level)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
from fastapi.responses import ORJSONResponse
from fastapi_pagination import add_pagination

from app.api.exception_handlers import register_exception_handlers
from app.api.router import api_router
from app.core.middleware import RequestIDMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan - startup and shutdown events.

    Resources yielded here are available via request.state in route handlers.
    See: https://asgi.readthedocs.io/en/latest/specs/lifespan.html#lifespan-state
    """
    # === Startup ===

    yield

    # === Shutdown ===
    from app.db.session import close_db

    await close_db()


# Environments where API docs should be visible
SHOW_DOCS_ENVIRONMENTS = ("local", "staging", "development")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    # Only show docs in allowed environments (hide in production)
    show_docs = settings.ENVIRONMENT in SHOW_DOCS_ENVIRONMENTS
    openapi_url = f"{settings.API_V1_STR}/openapi.json" if show_docs else None
    docs_url = "/docs" if show_docs else None
    redoc_url = "/redoc" if show_docs else None

    # OpenAPI tags for better documentation organization
    openapi_tags = [
        {
            "name": "health",
            "description": "Health check endpoints for monitoring and Kubernetes probes",
        },
        {
            "name": "items",
            "description": "Example CRUD endpoints demonstrating the API pattern",
        },
        {
            "name": "agent",
            "description": "AI agent WebSocket endpoint for real-time chat",
        },
    ]

    app = FastAPI(
        title=settings.PROJECT_NAME,
        summary="FastAPI application",
        description="""
AutoViz - revolution to visualisation

## Features
- **Database**: Async database operations
- **AI Agent**: PydanticAI-powered conversational assistant

## Documentation

- [Swagger UI](/docs) - Interactive API documentation
- [ReDoc](/redoc) - Alternative documentation view
        """.strip(),
        version="0.1.0",
        openapi_url=openapi_url,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_tags=openapi_tags,
        contact={
            "name": "LB HYX LYY HYC",
            "email": "feiyilubo@gmail.com",
        },
        license_info={
            "name": "MIT",
            "identifier": "MIT",
        },
        lifespan=lifespan,
        default_response_class=ORJSONResponse,
    )

    # Request ID middleware (for request correlation/debugging)
    app.add_middleware(RequestIDMiddleware)

    # Exception handlers
    register_exception_handlers(app)

    # CORS middleware
    from starlette.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
        allow_methods=settings.CORS_ALLOW_METHODS,
        allow_headers=settings.CORS_ALLOW_HEADERS,
    )

    # API Version Deprecation (uncomment when deprecating old versions)
    # Example: Mark v1 as deprecated when v2 is ready
    # from app.api.versioning import VersionDeprecationMiddleware
    # app.add_middleware(
    #     VersionDeprecationMiddleware,
    #     deprecated_versions={
    #         "v1": {
    #             "sunset": "2025-12-31",
    #             "link": "/docs/migration/v2",
    #             "message": "Please migrate to API v2",
    #         }
    #     },
    # )

    # Include API router
    app.include_router(api_router, prefix=settings.API_V1_STR)

    # Pagination
    add_pagination(app)

    return app


app = create_app()
