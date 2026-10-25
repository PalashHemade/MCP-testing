import pytest
from sqlalchemy import func, select

from app.models.trip import Trip
from app.scripts.seed_demo import seed


@pytest.mark.asyncio
async def test_reseeding_does_not_duplicate_trips(db_session):
    before = (await db_session.execute(select(func.count()).select_from(Trip))).scalar_one()
    await seed()
    await seed()
    after = (await db_session.execute(select(func.count()).select_from(Trip))).scalar_one()
    assert before == after
