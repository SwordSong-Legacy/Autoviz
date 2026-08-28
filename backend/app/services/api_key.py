import httpx

from app.core.config import settings


async def verify_openrouter_api_key(api_key: str) -> tuple[bool, str, dict | None]:
    """
    调用 OpenRouter 的验证接口（例如获取模型列表）来判断 key 是否有效。
    返回 (is_valid, message, data)
    """
    # OpenRouter 的 API 基础 URL（从配置读取）
    base_url = settings.OPENROUTER_BASE_URL or "https://openrouter.ai/api/v1"

    # 选择一个轻量的端点来测试 key，比如获取模型列表
    url = f"{base_url}/models"

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            if response.status_code == 200:
                # 成功，返回模型列表数据（可选）
                data = response.json()
                return True, "Valid API Key", data
            elif response.status_code == 401:
                return False, "Invalid API Key (Unauthorized)", None
            else:
                return False, f"API Key Configuration Error(状态码 {response.status_code})", None
        except httpx.RequestError as e:
            return False, f"Network error:{e!s}", None
        except Exception as e:
            return False, f"Unknown error:{e!s}", None
