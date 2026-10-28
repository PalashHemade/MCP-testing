import type { PoolClient } from "pg";
import { effectiveCustomerFilter, type AuthenticatedUser } from "../../auth/models.js";
import { ListTripsInput, ListTripsOutput } from "../../schemas/tools.js";
import { TripService } from "../../services/tripService.js";

export const TOOL_NAME = "list_trips";

export async function run(
  client: PoolClient,
  user: AuthenticatedUser,
  input: ListTripsInput,
): Promise<ListTripsOutput> {
  const service = new TripService(client);
  const { trips, pageInfo, completeness } = await service.listTrips({
    tenantId: user.tenantId,
    startDate: input.startDate,
    endDate: input.endDate,
    tripStatus: input.tripStatus,
    customerId: effectiveCustomerFilter(user, input.customerId) ?? undefined,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    origin: input.origin,
    destination: input.destination,
    limit: input.limit,
    offset: input.offset,
  });
  const { limit, offset, ...appliedFilters } = input;
  return { trips, appliedFilters, pageInfo, completeness };
}
