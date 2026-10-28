import type { PoolClient } from "pg";
import { effectiveCustomerFilter, type AuthenticatedUser } from "../../auth/models.js";
import { GetTripDetailsInput, GetTripDetailsOutput } from "../../schemas/tools.js";
import { TripService } from "../../services/tripService.js";

export const TOOL_NAME = "get_trip_details";

export async function run(
  client: PoolClient,
  user: AuthenticatedUser,
  input: GetTripDetailsInput,
): Promise<GetTripDetailsOutput> {
  const service = new TripService(client);
  const trip = await service.getTripDetails({
    tenantId: user.tenantId,
    tripNumber: input.tripNumber,
    tripId: input.tripId,
    customerScope: effectiveCustomerFilter(user),
  });
  // Not-found is uniform whether the trip doesn't exist, belongs to
  // another tenant, or belongs to a different customer.
  return { found: trip !== null, trip, completeness: "complete" };
}
