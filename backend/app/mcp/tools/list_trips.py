from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.schemas.tools import ListTripsInput, ListTripsOutput
from app.services.trip_service import TripService

TOOL_NAME = "list_trips"


async def run(session: AsyncSession, user: AuthenticatedUser, input_data: ListTripsInput) -> ListTripsOutput:
    service = TripService(session)
    trips, page_info, completeness = await service.list_trips(
        tenant_id=user.tenant_id,
        start_date=input_data.start_date,
        end_date=input_data.end_date,
        trip_status=input_data.trip_status,
        customer_id=user.effective_customer_filter(input_data.customer_id),
        vehicle_id=input_data.vehicle_id,
        driver_id=input_data.driver_id,
        origin=input_data.origin,
        destination=input_data.destination,
        limit=input_data.limit,
        offset=input_data.offset,
    )
    return ListTripsOutput(
        trips=trips,
        applied_filters=input_data.model_dump(exclude={"limit", "offset"}, exclude_none=True),
        page_info=page_info,
        completeness=completeness,
    )
