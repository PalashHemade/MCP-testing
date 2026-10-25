from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings

settings = get_settings()

# NullPool: no cross-request connection pooling. Simpler and avoids
# pool_pre_ping's occasional cross-event-loop ping errors seen under
# pytest-asyncio; fine at this demo's scale. A production deployment with
# higher concurrency should switch to a pooled engine (and, for Supabase,
# route pooled app traffic through its session-mode pooler).
engine = create_async_engine(settings.database_url, poolclass=NullPool, future=True)

AsyncSessionLocal = async_sessionmaker(
    bind=engine, expire_on_commit=False, class_=AsyncSession
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a request-scoped AsyncSession."""
    async with AsyncSessionLocal() as session:
        yield session


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Context manager for scripts/tools that need a session outside FastAPI."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
