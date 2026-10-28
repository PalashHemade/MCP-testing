import type { PoolClient } from "pg";
import type { AuthenticatedUser } from "../../auth/models.js";
import { GetDriverTripHistoryInput, GetDriverTripHistoryOutput } from "../../schemas/tools.js";
import { DriverService } from "../../services/driverService.js";

export const TOOL_NAME = "get_driver_trip_history";

export async function run(
  client: PoolClient,
  user: AuthenticatedUser,
  input: GetDriverTripHistoryInput,
): Promise<GetDriverTripHistoryOutput> {
  const service = new DriverService(client);
  const result = await service.getDriverTripHistory({
    tenantId: user.tenantId,
    driverId: input.driverId,
    driverName: input.driverName,
    startDate: input.startDate,
    endDate: input.endDate,
    limit: input.limit,
    offset: input.offset,
  });
  return {
    ambiguous: result.ambiguous,
    matchingDrivers: result.matchingDrivers,
    driver: result.driver,
    trips: result.trips,
    tripCount: result.trips.length,
    totalRecordedDistanceKm: result.totalRecordedDistanceKm,
    pageInfo: result.pageInfo,
    completeness: result.completeness,
  };
}
