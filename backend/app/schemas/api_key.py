from pydantic import BaseModel


class APIKeyVerifyRequest(BaseModel):
    api_key: str


class APIKeyVerifyResponse(BaseModel):
    valid: bool
    message: str
    # 可选的额外信息，比如 key 对应的用户信息、余额等
    data: dict | None = None
