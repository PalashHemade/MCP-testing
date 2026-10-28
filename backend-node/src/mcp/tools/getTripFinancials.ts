import type { PoolClient } from "pg";
import { effectiveCustomerFilter, type AuthenticatedUser } from "../../auth/models.js";
import { GetTripFinancialsInput, GetTripFinancialsOutput } from "../../schemas/tools.js";
import { TripService } from "../../services/tripService.js";

export const TOOL_NAME = "get_trip_financials";

export async function run(
  client: PoolClient,
  user: AuthenticatedUser,
  input: GetTripFinancialsInput,
): Promise<GetTripFinancialsOutput> {
  const service = new TripService(client);
  const financials = await service.getTripFinancials({
    tenantId: user.tenantId,
    tripNumber: input.tripNumber,
    tripId: input.tripId,
    asOf: new Date().toISOString().slice(0, 10),
    customerScope: effectiveCustomerFilter(user),
  });
  return { found: financials !== null, financials, completeness: "complete" };
}
