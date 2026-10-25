from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TripStatus
from app.repositories.vehicles import VehicleRepository
from app.schemas.tools import VehicleUtilizationResult


class VehicleService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.vehicles = VehicleRepository(session)

    async def get_vehicle_utilization(
        self, *, tenant_id: UUID, vehicle_id: UUID | None, start_date: date | None, end_date: date | None
    ) -> list[VehicleUtilizationResult]:
        vehicles = await self.vehicles.list_for_tenant(tenant_id=tenant_id, vehicle_id=vehicle_id)
        results: list[VehicleUtilizationResult] = []
        for vehicle in vehicles:
            trips = await self.vehicles.get_trips_for_vehicle(
                tenant_id=tenant_id, vehicle_id=vehicle.vehicle_id, start_date=start_date, end_date=end_date
            )
            completed = sum(1 for t in trips if t.trip_status == TripStatus.COMPLETED)
            in_transit = sum(1 for t in trips if t.trip_status == TripStatus.IN_TRANSIT)
            total_distance = sum((t.distance_km for t in trips if t.distance_km is not None), Decimal("0"))
            results.append(
                VehicleUtilizationResult(
                    vehicle_id=vehicle.vehicle_id,
                    registration_no=vehicle.registration_no,
                    vehicle_type=vehicle.vehicle_type,
                    trip_count=len(trips),
                    completed_trip_count=completed,
                    in_transit_trip_count=in_transit,
                    total_recorded_distance_km=total_distance,
                )
            )
        return results
