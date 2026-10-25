from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.schemas.common import CompletenessStatus
from app.schemas.tools import GetTripDetailsInput, GetTripDetailsOutput
from app.services.trip_service import TripService

TOOL_NAME = "get_trip_details"


async def run(
    session: AsyncSession, user: AuthenticatedUser, input_data: GetTripDetailsInput
) -> GetTripDetailsOutput:
    service = TripService(session)
    trip = await service.get_trip_details(
        tenant_id=user.tenant_id, trip_number=input_data.trip_number, trip_id=input_data.trip_id,
        customer_scope=user.effective_customer_filter(),
    )
    # Not-found is reported uniformly whether the trip doesn't exist at all,
    # belongs to another tenant, or (for a "customer" caller) belongs to a
    # different customer within the same tenant - callers never learn which.
    return GetTripDetailsOutput(
        found=trip is not None, trip=trip, completeness=CompletenessStatus.COMPLETE
    )
