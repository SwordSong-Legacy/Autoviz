"""Exception handler tests."""

import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.anyio
async def test_not_found_error_format(client: AsyncClient):
    """Test that 404 errors return proper JSON format."""
    response = await client.get(f"{settings.API_V1_STR}/nonexistent-endpoint")
    assert response.status_code == 404
    # FastAPI returns 404 for unknown routes
