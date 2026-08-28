from fastapi import APIRouter

from app.schemas.api_key import APIKeyVerifyRequest, APIKeyVerifyResponse
from app.services.api_key import verify_openrouter_api_key

router = APIRouter()


@router.post("/verify", response_model=APIKeyVerifyResponse)
async def verify_api_key(request: APIKeyVerifyRequest):
    """
    验证用户提供的 API Key 是否有效
    """
    is_valid, message, data = await verify_openrouter_api_key(request.api_key)
    return APIKeyVerifyResponse(valid=is_valid, message=message, data=data)
