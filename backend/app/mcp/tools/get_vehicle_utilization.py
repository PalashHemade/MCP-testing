from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.schemas.common import CompletenessStatus
from app.schemas.tools import GetVehicleUtilizationInput, GetVehicleUtilizationOutput
from app.services.vehicle_service import VehicleService

TOOL_NAME = "get_vehicle_utilization"


async def run(
    session: AsyncSession, user: AuthenticatedUser, input_data: GetVehicleUtilizationInput
) -> GetVehicleUtilizationOutput:
    service = VehicleService(session)
    results = await service.get_vehicle_utilization(
        tenant_id=user.tenant_id,
        vehicle_id=input_data.vehicle_id,
        start_date=input_data.start_date,
        end_date=input_data.end_date,
    )
    return GetVehicleUtilizationOutput(
        results=results,
        applied_filters=input_data.model_dump(exclude_none=True),
        completeness=CompletenessStatus.COMPLETE,
    )
