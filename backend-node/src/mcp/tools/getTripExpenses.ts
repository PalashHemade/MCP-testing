import type { PoolClient } from "pg";
import { effectiveCustomerFilter, type AuthenticatedUser } from "../../auth/models.js";
import { GetTripExpensesInput, GetTripExpensesOutput } from "../../schemas/tools.js";
import { TripService } from "../../services/tripService.js";

export const TOOL_NAME = "get_trip_expenses";

export async function run(
  client: PoolClient,
  user: AuthenticatedUser,
  input: GetTripExpensesInput,
): Promise<GetTripExpensesOutput> {
  const service = new TripService(client);
  const result = await service.getTripExpenses({
    tenantId: user.tenantId,
    tripNumber: input.tripNumber,
    tripId: input.tripId,
    expenseCategory: input.expenseCategory,
    startDate: input.startDate,
    endDate: input.endDate,
    customerScope: effectiveCustomerFilter(user),
  });

  if (!result) {
    return {
      found: false,
      tripId: null,
      expenses: [],
      categoryBreakdown: {},
      totalRecordedExpenses: "0.00",
      appliedFilters: input,
      completeness: "complete",
    };
  }
  return {
    found: true,
    tripId: result.tripId,
    expenses: result.expenses,
    categoryBreakdown: result.breakdown,
    totalRecordedExpenses: result.total,
    appliedFilters: input,
    completeness: "complete",
  };
}
