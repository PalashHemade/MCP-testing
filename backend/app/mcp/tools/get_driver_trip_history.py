from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.schemas.tools import GetDriverTripHistoryInput, GetDriverTripHistoryOutput
from app.services.driver_service import DriverService

TOOL_NAME = "get_driver_trip_history"


async def run(
    session: AsyncSession, user: AuthenticatedUser, input_data: GetDriverTripHistoryInput
) -> GetDriverTripHistoryOutput:
    service = DriverService(session)
    ambiguous, matching, driver, trips, total_distance, page_info, completeness = (
        await service.get_driver_trip_history(
            tenant_id=user.tenant_id,
            driver_id=input_data.driver_id,
            driver_name=input_data.driver_name,
            start_date=input_data.start_date,
            end_date=input_data.end_date,
            limit=input_data.limit,
            offset=input_data.offset,
        )
    )
    return GetDriverTripHistoryOutput(
        ambiguous=ambiguous,
        matching_drivers=matching,
        driver=driver,
        trips=trips,
        trip_count=len(trips),
        total_recorded_distance_km=total_distance,
        page_info=page_info,
        completeness=completeness,
    )
