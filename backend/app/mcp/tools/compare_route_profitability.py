from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.schemas.common import CompletenessStatus
from app.schemas.tools import CompareRouteProfitabilityInput, CompareRouteProfitabilityOutput
from app.services.route_service import RouteService

TOOL_NAME = "compare_route_profitability"


async def run(
    session: AsyncSession, user: AuthenticatedUser, input_data: CompareRouteProfitabilityInput
) -> CompareRouteProfitabilityOutput:
    service = RouteService(session)
    results = await service.compare_route_profitability(
        tenant_id=user.tenant_id,
        start_date=input_data.start_date,
        end_date=input_data.end_date,
        origin=input_data.origin,
        destination=input_data.destination,
        min_sample_size=input_data.min_sample_size,
    )
    return CompareRouteProfitabilityOutput(
        results=results,
        applied_filters=input_data.model_dump(exclude={"min_sample_size"}, exclude_none=True),
        completeness=CompletenessStatus.COMPLETE,
    )
