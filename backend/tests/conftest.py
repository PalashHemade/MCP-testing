"""Shared pytest fixtures.

Integration/evaluation tests run against DATABASE_URL (see backend/.env) -
by default the local docker-compose Postgres. They are NOT run against an
in-memory DB because the schema uses real Postgres features (pgvector,
composite foreign keys, enums). Point DATABASE_URL at a disposable
test/CI database if you don't want to seed/mutate your local dev data;
the seed step is idempotent either way.

Each test runs inside a SAVEPOINT-backed AsyncSession that is rolled back
afterwards, so tests cannot leak writes into one another or into the
seeded baseline data.

Gemini calls are forced offline for this entire session (see below) - the
suite must never depend on, or spend quota against, a real GEMINI_API_KEY
that happens to be sitting in your local .env. Set RUN_LIVE_GEMINI_TESTS=1
to opt into live calls for a manual check; this is never done in CI.

db_session (used by most tests) runs as the privileged ADMIN_DATABASE_URL
role, deliberately bypassing Row-Level Security - these tests exercise
application-level tenant/customer filtering (the repository/service
layer's own WHERE clauses), which must hold on its own regardless of RLS.
RLS itself - whether the restricted app_runtime role is actually subject
to those policies - is proven independently in
tests/integration/test_row_level_security.py via rls_session, which binds
to the real DATABASE_URL (app_runtime) role.
"""
import asyncio
import os

# Must run before any `from app...` import below, since app.config.get_settings
# is @lru_cache'd and several modules call it at import time - once cached,
# a real key from .env would otherwise make every test session hit the live
# Gemini API (see app.planner.planner.get_planner_client), which is exactly
# what section 19 of the brief says this suite must not require.
if not os.environ.get("RUN_LIVE_GEMINI_TESTS"):
    os.environ["GEMINI_API_KEY"] = ""

import pytest
import pytest_asyncio

from app.auth.dev_auth import DEV_USERS
from app.db.admin_session import admin_engine
from app.db.session import engine as app_engine
from app.scripts.seed_demo import seed
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture(scope="session")
def event_loop():
    """All async fixtures/tests in this session share one event loop, so
    the SQLAlchemy async engine's pooled asyncpg connections (which are
    bound to whichever loop first used them) stay valid for every test
    rather than erroring on a loop mismatch at teardown.
    """
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def seeded_database():
    await seed()
    yield


@pytest_asyncio.fixture
async def db_session():
    """Admin (RLS-bypassing) session - see module docstring."""
    async with admin_engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()


@pytest_asyncio.fixture
async def rls_session():
    """Real app_runtime (RLS-subject) session, with NO scope GUCs set yet
    - tests must call set_rls_scope() themselves, mirroring what
    app.auth.dependencies.get_scoped_db does per-request.
    """
    async with app_engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()


async def set_rls_scope(session: AsyncSession, *, tenant_id, customer_id=None) -> None:
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :v, false)"), {"v": str(tenant_id)}
    )
    await session.execute(
        text("SELECT set_config('app.current_customer_id', :v, false)"),
        {"v": str(customer_id) if customer_id else ""},
    )


@pytest.fixture
def primary_user():
    return DEV_USERS["demo-ops-primary"]


@pytest.fixture
def secondary_user():
    return DEV_USERS["demo-ops-secondary"]


@pytest.fixture
def customer_acme_user():
    return DEV_USERS["demo-customer-acme"]


@pytest.fixture
def customer_bharat_user():
    return DEV_USERS["demo-customer-bharat"]
