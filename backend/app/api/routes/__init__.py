"""API routes.

This package contains versioned API routes.
Add new versions by creating new folders (e.g., v2/) and updating router.py.
"""

from fastapi import APIRouter

from app.api.routes.v1 import api_key, v1_router

router = APIRouter()
router.include_router(api_key.router, prefix="/api-key", tags=["API Key"])
__all__ = ["v1_router"]
