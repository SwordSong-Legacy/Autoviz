"""Application configuration using Pydantic BaseSettings."""
# ruff: noqa: I001 - Imports structured for Jinja2 template conditionals

from pathlib import Path
from typing import Literal
from urllib.parse import quote_plus

from pydantic import computed_field, field_validator, ValidationInfo
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_env_file() -> Path | None:
    """Find .env file in current or parent directories."""
    current = Path.cwd()
    for path in [current, current.parent]:
        env_file = path / ".env"
        if env_file.exists():
            return env_file
    return None


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=find_env_file(),
        env_ignore_empty=True,
        extra="ignore",
    )

    # === Project ===
    PROJECT_NAME: str = "autoviz"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False
    ENVIRONMENT: Literal["development", "local", "staging", "production"] = "local"
    LOG_LEVEL: str = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL

    # === Database (PostgreSQL async) ===
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "autoviz"
    POSTGRES_SSLMODE: str = ""  # Set to "require" for Cloud SQL public IP

    # === JWT Authentication ===
    SECRET_KEY: str = "7f8a9b2c3d4e5f60718293a4b5c6d7e8091a2b3c4d5e6f708192a3b4c5d6e7f8"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    ALGORITHM: str = "HS256"

    def _build_db_url(self, *, async_driver: bool) -> str:
        """Build PostgreSQL connection URL (async or sync).

        When POSTGRES_HOST is a Cloud SQL connection name (project:region:instance),
        uses Unix socket format for Cloud Run compatibility.
        """
        user = quote_plus(self.POSTGRES_USER)
        password = quote_plus(self.POSTGRES_PASSWORD)

        # Cloud SQL connection name format: project:region:instance
        # Use Unix socket to avoid URL parsing errors (colons in host)
        if ":" in self.POSTGRES_HOST and not self.POSTGRES_HOST.startswith("/"):
            socket_path = f"/cloudsql/{self.POSTGRES_HOST}"
            driver = "postgresql+asyncpg" if async_driver else "postgresql"
            # Encode path for URL (colons in project:region:instance must be encoded)
            return (
                f"{driver}://{user}:{password}@/{self.POSTGRES_DB}?host={quote_plus(socket_path)}"
            )

        # Standard TCP connection
        driver = "postgresql+asyncpg" if async_driver else "postgresql"
        base = f"{driver}://{user}:{password}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        if self.POSTGRES_SSLMODE:
            sep = "&" if "?" in base else "?"
            return f"{base}{sep}sslmode={self.POSTGRES_SSLMODE}"
        return base

    @computed_field  # type: ignore[prop-decorator]
    @property
    def DATABASE_URL(self) -> str:
        """Build async PostgreSQL connection URL."""
        return self._build_db_url(async_driver=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def DATABASE_URL_SYNC(self) -> str:
        """Build sync PostgreSQL connection URL (for Alembic)."""
        return self._build_db_url(async_driver=False)

    # Pool configuration
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30

    # === AI Agent (pydantic_ai, openrouter) ===
    OPENROUTER_API_KEY: str = ""
    AI_MODEL: str = "anthropic/claude-3.5-sonnet"
    AI_TEMPERATURE: float = 0.7
    AI_FRAMEWORK: str = "pydantic_ai"
    LLM_PROVIDER: str = "openrouter"

    # === File upload & CSV pipeline ===
    CSV_UPLOAD_MAX_SIZE_MB: float = 5.0
    CSV_SAMPLE_SIZE: int = 5  # Rows to sample for agent context
    URL_FETCH_TIMEOUT_SECONDS: float = 15.0
    URL_FETCH_MAX_SIZE_MB: float = 5.0
    URL_FETCH_MAX_REDIRECTS: int = 3
    URL_INGEST_FALLBACK_DELAY_SECONDS: float = 8.0

    # === Modal Sandbox (feature engineering + visualization code execution) ===
    MODAL_TOKEN_ID: str = ""
    MODAL_TOKEN_SECRET: str = ""
    MODAL_APP_NAME: str = "autoviz"

    # === Visualization workspace ===
    VIZ_WORKSPACE_DIR: str = "workspace/viz"
    VIZ_HISTORY_FILE: str = "workspace/history.md"
    VIZ_TARGET_CHARTS: int = 5
    VIZ_CONCURRENCY: int = 5
    VIZ_TURNS: int = 1  # Number of planning turns; total charts = VIZ_TARGET_CHARTS * VIZ_TURNS
    VIZ_CRITIC_MAX_CODE_ROUNDS: int = (
        3  # Code gen + execute + critic cycles (includes first attempt)
    )
    VIZ_CRITIC_MAX_SEMANTIC_REPLANS: int = (
        2  # Max replacement tasks per lineage after semantic critic reject
    )

    # === Visualization Selector (task feasibility + IG filter) ===
    VIZ_SELECTOR_ENABLED: bool = False
    VIZ_SELECTOR_MAX_MISSING_RATE: float = 0.7  # Reject tasks whose primary feature exceeds this missing fraction
    VIZ_SELECTOR_MIN_IG_SCORE: float = 0.2  # Reject tasks scoring below this information-gain threshold

    # === CORS ===
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8000"]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: list[str] = ["*"]
    CORS_ALLOW_HEADERS: list[str] = ["*"]

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, v: list[str], info: ValidationInfo) -> list[str]:
        """Warn if CORS_ORIGINS is too permissive in production."""
        env = info.data.get("ENVIRONMENT", "local") if info.data else "local"
        if "*" in v and env == "production":
            raise ValueError(
                "CORS_ORIGINS cannot contain '*' in production! Specify explicit allowed origins."
            )
        return v

    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"


settings = Settings()
