"""Privileged DB session for migrations/seeding/admin scripts only.

Bound to settings.admin_database_url (the table-owning `logistics` role),
deliberately separate from app.db.session.engine (the `app_runtime` role
the running FastAPI app uses, which IS subject to Row-Level Security).
Scripts here must see/write every row regardless of any tenant/customer
scope, so they intentionally bypass RLS - never import this module from
request-handling code (app.api.*, app.mcp.tools.*, app.services.*).
"""
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings

settings = get_settings()

admin_engine = create_async_engine(settings.admin_database_url, poolclass=NullPool, future=True)

AdminSessionLocal = async_sessionmaker(bind=admin_engine, expire_on_commit=False, class_=AsyncSession)


@asynccontextmanager
async def admin_session_scope() -> AsyncIterator[AsyncSession]:
    async with AdminSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
