from datetime import date
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.driver import Driver
from app.models.enums import TripStatus
from app.models.trip import Trip
from app.models.vehicle import Vehicle


def _base_trip_query() -> Select:
    return (
        select(Trip, Customer.customer_name, Vehicle.registration_no, Driver.driver_name)
        .join(Customer, (Customer.tenant_id == Trip.tenant_id) & (Customer.customer_id == Trip.customer_id))
        .join(Vehicle, (Vehicle.tenant_id == Trip.tenant_id) & (Vehicle.vehicle_id == Trip.vehicle_id))
        .join(Driver, (Driver.tenant_id == Trip.tenant_id) & (Driver.driver_id == Trip.driver_id))
    )


class TripRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_trips(
        self,
        *,
        tenant_id: UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        trip_status: TripStatus | None = None,
        customer_id: UUID | None = None,
        vehicle_id: UUID | None = None,
        driver_id: UUID | None = None,
        origin: str | None = None,
        destination: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[tuple], int]:
        query = _base_trip_query().where(Trip.tenant_id == tenant_id)
        count_query = select(func.count()).select_from(Trip).where(Trip.tenant_id == tenant_id)

        conditions = []
        if start_date:
            conditions.append(Trip.start_date >= start_date)
        if end_date:
            conditions.append(Trip.start_date <= end_date)
        if trip_status:
            conditions.append(Trip.trip_status == trip_status)
        if customer_id:
            conditions.append(Trip.customer_id == customer_id)
        if vehicle_id:
            conditions.append(Trip.vehicle_id == vehicle_id)
        if driver_id:
            conditions.append(Trip.driver_id == driver_id)
        if origin:
            conditions.append(Trip.origin.ilike(f"%{origin}%"))
        if destination:
            conditions.append(Trip.destination.ilike(f"%{destination}%"))

        for cond in conditions:
            query = query.where(cond)
            count_query = count_query.where(cond)

        total_count = (await self.session.execute(count_query)).scalar_one()

        query = query.order_by(Trip.start_date.desc(), Trip.trip_number).limit(limit).offset(offset)
        rows = (await self.session.execute(query)).all()
        return rows, total_count

    async def get_by_number_or_id(
        self,
        *,
        tenant_id: UUID,
        trip_number: str | None,
        trip_id: UUID | None,
        customer_id: UUID | None = None,
    ) -> tuple | None:
        """customer_id, when given, is an authorization filter (a
        "customer" role caller may only ever fetch their own trips by
        number/id) - callers pass the caller's own customer_id here, never
        a value the caller/tool-argument/LLM supplied.
        """
        query = _base_trip_query().where(Trip.tenant_id == tenant_id)
        if customer_id:
            query = query.where(Trip.customer_id == customer_id)
        if trip_id:
            query = query.where(Trip.trip_id == trip_id)
        elif trip_number:
            query = query.where(Trip.trip_number == trip_number)
        else:
            return None
        result = (await self.session.execute(query)).first()
        return result

    async def get_trip_row(self, *, tenant_id: UUID, trip_id: UUID) -> Trip | None:
        query = select(Trip).where(Trip.tenant_id == tenant_id, Trip.trip_id == trip_id)
        return (await self.session.execute(query)).scalar_one_or_none()
