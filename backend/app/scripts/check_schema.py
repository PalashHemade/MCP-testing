"""Schema / connectivity health-check.

Run with: python -m app.scripts.check_schema
"""
import asyncio

from sqlalchemy import text

from app.config import get_settings
from app.db.admin_session import admin_engine as engine

EXPECTED_TABLES = {
    "tenants", "customers", "vehicles", "drivers", "trips", "trip_billing",
    "trip_expenses", "logistics_documents", "document_chunks", "tool_metadata",
}


async def check() -> None:
    settings = get_settings()
    print(f"APP_ENV={settings.app_env}  DATABASE_URL={settings.database_url.split('@')[-1]}")

    async with engine.connect() as conn:
        rows = await conn.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
        )
        found = {r[0] for r in rows}

        missing = EXPECTED_TABLES - found
        if missing:
            print(f"MISSING TABLES: {sorted(missing)} - run 'alembic upgrade head'.")
        else:
            print(f"All {len(EXPECTED_TABLES)} expected tables are present.")

        try:
            ext = await conn.execute(text("SELECT extname FROM pg_extension WHERE extname='vector'"))
            has_vector = ext.first() is not None
            print(f"pgvector extension installed: {has_vector}")
        except Exception as exc:  # noqa: BLE001
            print(f"Could not check pgvector extension: {exc}")

        for table in sorted(found & EXPECTED_TABLES):
            count = (await conn.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one()
            print(f"  {table}: {count} rows")


if __name__ == "__main__":
    asyncio.run(check())
