from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.schemas.common import CompletenessStatus
from app.schemas.tools import GetCustomerTripSummaryInput, GetCustomerTripSummaryOutput
from app.services.customer_service import CustomerService

TOOL_NAME = "get_customer_trip_summary"


async def run(
    session: AsyncSession, user: AuthenticatedUser, input_data: GetCustomerTripSummaryInput
) -> GetCustomerTripSummaryOutput:
    service = CustomerService(session)
    # A "customer" role caller's own summary ALWAYS wins over whatever
    # customer_id the plan/tool argument supplied - this tool otherwise
    # lets an operator compare across customers, which a customer-portal
    # user must never be able to do by passing someone else's id.
    results = await service.get_customer_trip_summary(
        tenant_id=user.tenant_id,
        customer_id=user.effective_customer_filter(input_data.customer_id),
        start_date=input_data.start_date,
        end_date=input_data.end_date,
    )
    return GetCustomerTripSummaryOutput(
        results=results,
        applied_filters=input_data.model_dump(exclude_none=True),
        completeness=CompletenessStatus.COMPLETE,
    )
