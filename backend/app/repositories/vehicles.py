from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.trip import Trip
from app.models.vehicle import Vehicle


class VehicleRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_tenant(self, *, tenant_id: UUID, vehicle_id: UUID | None = None) -> list[Vehicle]:
        query = select(Vehicle).where(Vehicle.tenant_id == tenant_id)
        if vehicle_id:
            query = query.where(Vehicle.vehicle_id == vehicle_id)
        query = query.order_by(Vehicle.registration_no)
        return list((await self.session.execute(query)).scalars().all())

    async def get_trips_for_vehicle(
        self,
        *,
        tenant_id: UUID,
        vehicle_id: UUID,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[Trip]:
        query = select(Trip).where(Trip.tenant_id == tenant_id, Trip.vehicle_id == vehicle_id)
        if start_date:
            query = query.where(Trip.start_date >= start_date)
        if end_date:
            query = query.where(Trip.start_date <= end_date)
        return list((await self.session.execute(query)).scalars().all())
