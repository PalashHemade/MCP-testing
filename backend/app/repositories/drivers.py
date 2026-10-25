from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.driver import Driver
from app.models.trip import Trip


class DriverRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, *, tenant_id: UUID, driver_id: UUID) -> Driver | None:
        query = select(Driver).where(Driver.tenant_id == tenant_id, Driver.driver_id == driver_id)
        return (await self.session.execute(query)).scalar_one_or_none()

    async def find_by_name(self, *, tenant_id: UUID, driver_name: str) -> list[Driver]:
        query = select(Driver).where(
            Driver.tenant_id == tenant_id, Driver.driver_name.ilike(f"%{driver_name}%")
        )
        return list((await self.session.execute(query)).scalars().all())

    async def get_trips_for_driver(
        self,
        *,
        tenant_id: UUID,
        driver_id: UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Trip], int]:
        from sqlalchemy import func

        query = select(Trip).where(Trip.tenant_id == tenant_id, Trip.driver_id == driver_id)
        count_query = (
            select(func.count())
            .select_from(Trip)
            .where(Trip.tenant_id == tenant_id, Trip.driver_id == driver_id)
        )
        if start_date:
            query = query.where(Trip.start_date >= start_date)
            count_query = count_query.where(Trip.start_date >= start_date)
        if end_date:
            query = query.where(Trip.start_date <= end_date)
            count_query = count_query.where(Trip.start_date <= end_date)

        total_count = (await self.session.execute(count_query)).scalar_one()
        query = query.order_by(Trip.start_date.desc()).limit(limit).offset(offset)
        rows = list((await self.session.execute(query)).scalars().all())
        return rows, total_count
