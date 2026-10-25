from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central application configuration, loaded from environment / .env.

    Nothing here is a secret default - real credentials must come from the
    environment. Missing optional credentials (Gemini) are tolerated and
    surfaced as explicit "unavailable" behavior rather than fabricated.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    auth_mode: Literal["dev", "oidc"] = "dev"
    log_level: str = "INFO"

    # The RUNNING APP connects as app_runtime - an ordinary, non-owner role
    # created by migration 0002 specifically so Postgres Row-Level Security
    # actually applies to it (RLS is bypassed by superusers and by table
    # owners unless FORCE'd, so the app must be neither). See
    # docs/security.md "Row-Level Security" for the full design.
    database_url: str = (
        "postgresql+asyncpg://app_runtime:app_runtime_dev_password@localhost:5433/logistics_demo"
    )
    # Migrations, seeding, resets, and embedding rebuilds need the
    # privileged owner role (bypasses RLS by design - they must see/write
    # every row regardless of any session's tenant/customer scope).
    admin_database_url: str = (
        "postgresql+asyncpg://logistics:logistics_dev_password@localhost:5433/logistics_demo"
    )
    migration_database_url: str | None = None

    frontend_origin: str = "http://localhost:5173"
    demo_tenant_id: str = "11111111-1111-1111-1111-111111111111"

    allow_destructive_db_operations: bool = False

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    gemini_embedding_dimensions: int = 768

    mcp_server_host: str = "127.0.0.1"
    mcp_server_port: int = 8765

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def gemini_available(self) -> bool:
        return bool(self.gemini_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
