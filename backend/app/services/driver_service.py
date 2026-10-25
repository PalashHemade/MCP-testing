from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.driver import Driver
from app.repositories.drivers import DriverRepository
from app.schemas.common import CompletenessStatus, PageInfo
from app.schemas.domain import DriverBrief, TripSummary


def _brief(d: Driver) -> DriverBrief:
    return DriverBrief(driver_id=d.driver_id, driver_name=d.driver_name, driver_status=d.driver_status)


class DriverService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.drivers = DriverRepository(session)

    async def get_driver_trip_history(
        self,
        *,
        tenant_id: UUID,
        driver_id: UUID | None,
        driver_name: str | None,
        start_date: date | None,
        end_date: date | None,
        limit: int,
        offset: int,
    ) -> tuple[bool, list[DriverBrief], DriverBrief | None, list[TripSummary], Decimal, PageInfo | None, CompletenessStatus]:
        resolved_driver_id = driver_id
        matching: list[Driver] = []

        if resolved_driver_id is None and driver_name:
            matching = await self.drivers.find_by_name(tenant_id=tenant_id, driver_name=driver_name)
            if len(matching) > 1:
                return (
                    True,
                    [_brief(d) for d in matching],
                    None,
                    [],
                    Decimal("0"),
                    None,
                    CompletenessStatus.UNKNOWN,
                )
            if len(matching) == 1:
                resolved_driver_id = matching[0].driver_id

        if resolved_driver_id is None:
            return (False, [], None, [], Decimal("0"), None, CompletenessStatus.UNKNOWN)

        driver = await self.drivers.get(tenant_id=tenant_id, driver_id=resolved_driver_id)
        if driver is None:
            return (False, [], None, [], Decimal("0"), None, CompletenessStatus.UNKNOWN)

        trips, total_count = await self.drivers.get_trips_for_driver(
            tenant_id=tenant_id,
            driver_id=resolved_driver_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )
        summaries = [
            TripSummary(
                trip_id=t.trip_id,
                trip_number=t.trip_number,
                lr_number=t.lr_number,
                customer_id=t.customer_id,
                customer_name="",
                vehicle_id=t.vehicle_id,
                vehicle_registration_no="",
                driver_id=t.driver_id,
                driver_name=driver.driver_name,
                origin=t.origin,
                destination=t.destination,
                start_date=t.start_date,
                planned_delivery_date=t.planned_delivery_date,
                actual_delivery_date=t.actual_delivery_date,
                distance_km=t.distance_km,
                trip_status=t.trip_status,
            )
            for t in trips
        ]
        total_distance = sum((t.distance_km for t in trips if t.distance_km is not None), Decimal("0"))
        has_more = offset + len(summaries) < total_count
        page_info = PageInfo(
            limit=limit, offset=offset, returned_count=len(summaries),
            total_count=total_count, has_more=has_more,
        )
        completeness = CompletenessStatus.PARTIAL if has_more else CompletenessStatus.COMPLETE
        return (False, [], _brief(driver), summaries, total_distance, page_info, completeness)
