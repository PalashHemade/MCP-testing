import type { PoolClient } from "pg";
import type { AuthenticatedUser } from "../../auth/models.js";
import { GetVehicleUtilizationInput, GetVehicleUtilizationOutput } from "../../schemas/tools.js";
import { VehicleService } from "../../services/vehicleService.js";

export const TOOL_NAME = "get_vehicle_utilization";

export async function run(
  client: PoolClient,
  user: AuthenticatedUser,
  input: GetVehicleUtilizationInput,
): Promise<GetVehicleUtilizationOutput> {
  const service = new VehicleService(client);
  const results = await service.getVehicleUtilization({
    tenantId: user.tenantId,
    vehicleId: input.vehicleId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return { results, appliedFilters: input, completeness: "complete" };
}
