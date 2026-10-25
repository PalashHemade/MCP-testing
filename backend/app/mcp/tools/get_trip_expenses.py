from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.schemas.common import CompletenessStatus
from app.schemas.tools import GetTripExpensesInput, GetTripExpensesOutput
from app.services.trip_service import TripService

TOOL_NAME = "get_trip_expenses"


async def run(
    session: AsyncSession, user: AuthenticatedUser, input_data: GetTripExpensesInput
) -> GetTripExpensesOutput:
    service = TripService(session)
    result = await service.get_trip_expenses(
        tenant_id=user.tenant_id,
        trip_number=input_data.trip_number,
        trip_id=input_data.trip_id,
        expense_category=input_data.expense_category,
        start_date=input_data.start_date,
        end_date=input_data.end_date,
        customer_scope=user.effective_customer_filter(),
    )
    if result is None:
        return GetTripExpensesOutput(
            found=False,
            trip_id=None,
            expenses=[],
            category_breakdown={},
            total_recorded_expenses=0,
            applied_filters=input_data.model_dump(exclude_none=True),
            completeness=CompletenessStatus.COMPLETE,
        )
    trip_id, entries, breakdown, total = result
    return GetTripExpensesOutput(
        found=True,
        trip_id=trip_id,
        expenses=entries,
        category_breakdown=breakdown,
        total_recorded_expenses=total,
        applied_filters=input_data.model_dump(exclude_none=True),
        completeness=CompletenessStatus.COMPLETE,
    )
