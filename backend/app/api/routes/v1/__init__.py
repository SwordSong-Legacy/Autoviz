"""API v1 router aggregation."""
# ruff: noqa: I001 - Imports structured for Jinja2 template conditionals

from fastapi import APIRouter

from app.api.routes.v1 import agent
from app.api.routes.v1 import api_key
from app.api.routes.v1 import auth
from app.api.routes.v1 import conversations
from app.api.routes.v1 import health
from app.api.routes.v1 import items

v1_router = APIRouter()

# Health check routes (no auth required)
v1_router.include_router(health.router, tags=["health"])

# API Key verification (OpenRouter)
v1_router.include_router(api_key.router, prefix="/api-key", tags=["API Key"])

# Example CRUD routes (items)
v1_router.include_router(items.router, prefix="/items", tags=["items"])

# AI Agent routes
v1_router.include_router(agent.router, tags=["agent"])

# Authentication routes
v1_router.include_router(auth.router, tags=["auth"])

# Conversation and chat message routes (auth required)
v1_router.include_router(conversations.router)
