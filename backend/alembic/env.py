import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.models import Base  # noqa: E402  (imports all models so metadata is complete)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

settings = get_settings()


def _migration_url() -> str:
    """Resolve the URL Alembic should use.

    Prefers MIGRATION_DATABASE_URL (e.g. a Supabase *direct* connection,
    required because the transaction-mode pooler does not reliably support
    DDL / prepared statements). Falls back to ADMIN_DATABASE_URL (the
    table-owning role - migrations create the app_runtime role and RLS
    policies, which the restricted DATABASE_URL role cannot do).
    """
    return (
        os.environ.get("MIGRATION_DATABASE_URL")
        or settings.migration_database_url
        or settings.admin_database_url
    )


config.set_main_option("sqlalchemy.url", _migration_url())


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
