import type { PoolClient } from "pg";
import type { AuthenticatedUser } from "../../auth/models.js";
import { CompareRouteProfitabilityInput, CompareRouteProfitabilityOutput } from "../../schemas/tools.js";
import { RouteService } from "../../services/routeService.js";

export const TOOL_NAME = "compare_route_profitability";

export async function run(
  client: PoolClient,
  user: AuthenticatedUser,
  input: CompareRouteProfitabilityInput,
): Promise<CompareRouteProfitabilityOutput> {
  const service = new RouteService(client);
  const results = await service.compareRouteProfitability({
    tenantId: user.tenantId,
    startDate: input.startDate,
    endDate: input.endDate,
    origin: input.origin,
    destination: input.destination,
    minSampleSize: input.minSampleSize,
  });
  return {
    results,
    appliedFilters: input,
    completeness: "complete",
    directionalityNote:
      "Routes are directional: origin -> destination is grouped separately from destination -> origin.",
    metricNote:
      "aggregateProfitPerKm = sum(trip profit) / sum(trip distance_km) across all trips in the route group - this is NOT the average of each trip's individual profit-per-km ratio.",
  };
}
