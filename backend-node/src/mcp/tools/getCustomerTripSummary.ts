import type { PoolClient } from "pg";
import { effectiveCustomerFilter, type AuthenticatedUser } from "../../auth/models.js";
import { GetCustomerTripSummaryInput, GetCustomerTripSummaryOutput } from "../../schemas/tools.js";
import { CustomerService } from "../../services/customerService.js";

export const TOOL_NAME = "get_customer_trip_summary";

export async function run(
  client: PoolClient,
  user: AuthenticatedUser,
  input: GetCustomerTripSummaryInput,
): Promise<GetCustomerTripSummaryOutput> {
  const service = new CustomerService(client);
  // A "customer" role caller's own summary ALWAYS wins over whatever
  // customerId the plan/tool argument supplied.
  const results = await service.getCustomerTripSummary({
    tenantId: user.tenantId,
    customerId: effectiveCustomerFilter(user, input.customerId) ?? undefined,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  return { results, appliedFilters: input, completeness: "complete" };
}
