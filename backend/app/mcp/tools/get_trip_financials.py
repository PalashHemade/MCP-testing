from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.schemas.common import CompletenessStatus
from app.schemas.tools import GetTripFinancialsInput, GetTripFinancialsOutput
from app.services.trip_service import TripService

TOOL_NAME = "get_trip_financials"


async def run(
    session: AsyncSession, user: AuthenticatedUser, input_data: GetTripFinancialsInput
) -> GetTripFinancialsOutput:
    service = TripService(session)
    financials = await service.get_trip_financials(
        tenant_id=user.tenant_id,
        trip_number=input_data.trip_number,
        trip_id=input_data.trip_id,
        as_of=datetime.now(timezone.utc).date(),
        customer_scope=user.effective_customer_filter(),
    )
    return GetTripFinancialsOutput(
        found=financials is not None, financials=financials, completeness=CompletenessStatus.COMPLETE
    )
