"""Destructive reset of a DEVELOPMENT/TEST database only.

Run with: python -m app.scripts.reset_dev_db

Refuses to run unless ALLOW_DESTRUCTIVE_DB_OPERATIONS=true is set in the
environment - this is the only guard standing between this script and a
real database, so do not remove it or set that flag in a production
environment.
"""
import asyncio
import sys

from sqlalchemy import text

from app.config import get_settings
from app.db.admin_session import admin_engine as engine


async def reset() -> None:
    settings = get_settings()
    if not settings.allow_destructive_db_operations:
        print(
            "Refusing to reset: ALLOW_DESTRUCTIVE_DB_OPERATIONS is not set to true. "
            "This script drops all application tables and must only be pointed at a "
            "development or test database.",
            file=sys.stderr,
        )
        sys.exit(1)
    if settings.is_production:
        print("Refusing to reset: APP_ENV=production.", file=sys.stderr)
        sys.exit(1)

    tables = [
        "document_chunks", "logistics_documents", "tool_metadata",
        "trip_expenses", "trip_billing", "trips", "drivers", "vehicles",
        "customers", "tenants", "alembic_version",
    ]
    async with engine.begin() as conn:
        for table in tables:
            await conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
        for enum_name in (
            "trip_status", "vehicle_status", "driver_status", "payment_status",
            "expense_category", "document_type",
        ):
            await conn.execute(text(f"DROP TYPE IF EXISTS {enum_name} CASCADE"))
        # Dropping the tables above does not drop the app_runtime role
        # itself (roles aren't owned by tables), nor its schema-level
        # USAGE grant (not tied to any table) - both must be cleared
        # explicitly before DROP ROLE, or Postgres refuses with
        # "cannot be dropped because some objects depend on it".
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
                        REVOKE ALL PRIVILEGES ON SCHEMA public FROM app_runtime;
                    END IF;
                END
                $$;
                """
            )
        )
        await conn.execute(text("DROP ROLE IF EXISTS app_runtime"))

    print("Database reset complete. Run 'alembic upgrade head' then the seed script next.")


if __name__ == "__main__":
    asyncio.run(reset())
