/** Single source of truth for the 10 registered tools - mirrors
 * app.mcp.registry in the Python sibling backend. The planner may only
 * ever select tool names present here, and both the Express orchestrator
 * and the standalone MCP server call the exact same `run()` function -
 * there is exactly one implementation of each tool's logic.
 */
import type { PoolClient } from "pg";
import { z } from "zod";
import type { AuthenticatedUser, Role } from "../auth/models.js";
import * as compareRouteProfitability from "./tools/compareRouteProfitability.js";
import * as getCustomerTripSummary from "./tools/getCustomerTripSummary.js";
import * as getDriverTripHistory from "./tools/getDriverTripHistory.js";
import * as getTripDetails from "./tools/getTripDetails.js";
import * as getTripExpenses from "./tools/getTripExpenses.js";
import * as getTripFinancials from "./tools/getTripFinancials.js";
import * as getVehicleUtilization from "./tools/getVehicleUtilization.js";
import * as listTrips from "./tools/listTrips.js";
import * as listUnpaidInvoices from "./tools/listUnpaidInvoices.js";
import * as searchLogisticsDocuments from "./tools/searchLogisticsDocuments.js";
import {
  CompareRouteProfitabilityInput,
  CompareRouteProfitabilityOutput,
  GetCustomerTripSummaryInput,
  GetCustomerTripSummaryOutput,
  GetDriverTripHistoryInput,
  GetDriverTripHistoryOutput,
  GetTripDetailsInput,
  GetTripDetailsOutput,
  GetTripExpensesInput,
  GetTripExpensesOutput,
  GetTripFinancialsInput,
  GetTripFinancialsOutput,
  GetVehicleUtilizationInput,
  GetVehicleUtilizationOutput,
  ListTripsInput,
  ListTripsOutput,
  ListUnpaidInvoicesInput,
  ListUnpaidInvoicesOutput,
  SearchLogisticsDocumentsInput,
  SearchLogisticsDocumentsOutput,
} from "../schemas/tools.js";

export interface ToolSpec {
  name: string;
  run: (client: PoolClient, user: AuthenticatedUser, input: unknown) => Promise<unknown>;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  purpose: string;
  description: string;
  limitations: string;
  permissions: string;
  exampleQuestions: string[];
  /** Which roles may invoke this tool at all - checked in tool
   * retrieval/knowledge resolution (candidate filtering) and
   * src/planner/planner.ts validatePlan (hard gate). */
  allowedRoles: Set<Role>;
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "list_trips",
    run: listTrips.run as ToolSpec["run"],
    inputSchema: ListTripsInput,
    outputSchema: ListTripsOutput,
    purpose: "Find trips matching filters such as status, date range, customer, vehicle, driver, or route.",
    description:
      "Lists trips for the caller's tenant, optionally filtered by start/end date, tripStatus, " +
      "customerId, vehicleId, driverId, origin, destination. Supports pagination.",
    limitations: "Caps at 500 trips/page; check pageInfo.hasMore before treating results as exhaustive.",
    permissions: "Read-only; tenant-scoped automatically.",
    exampleQuestions: ["Show all trips currently in transit.", "List trips from Delhi to Mumbai in March."],
    allowedRoles: new Set(["operator", "customer"]),
  },
  {
    name: "get_trip_details",
    run: getTripDetails.run as ToolSpec["run"],
    inputSchema: GetTripDetailsInput,
    outputSchema: GetTripDetailsOutput,
    purpose: "Retrieve the full operational record for exactly one trip.",
    description: "Looks up one trip by tripNumber or tripId and returns customer, vehicle, driver, route, status.",
    limitations: "found=false is uniform for nonexistent/another-tenant's/another-customer's trip.",
    permissions: "Read-only; tenant-scoped.",
    exampleQuestions: ["Show me the details of TRIP-1001.", "What is the LR number for TRIP-1002?"],
    allowedRoles: new Set(["operator", "customer"]),
  },
  {
    name: "get_trip_financials",
    run: getTripFinancials.run as ToolSpec["run"],
    inputSchema: GetTripFinancialsInput,
    outputSchema: GetTripFinancialsOutput,
    purpose: "Return a trip's billing, expenses, profit, and profit-per-km.",
    description:
      "Given tripNumber/tripId, returns invoices, gross billed amount, outstanding balance, " +
      "recorded expenses, trip profit, and profit-per-km when distance is known.",
    limitations: "tripProfit is null (not 0) with no invoice; profitPerKm is null without positive distance.",
    permissions: "Read-only; tenant-scoped.",
    exampleQuestions: ["What was the profit on TRIP-1001?", "What is the profit per kilometre for TRIP-1001?"],
    allowedRoles: new Set(["operator", "customer"]),
  },
  {
    name: "get_trip_expenses",
    run: getTripExpenses.run as ToolSpec["run"],
    inputSchema: GetTripExpensesInput,
    outputSchema: GetTripExpensesOutput,
    purpose: "Retrieve itemized expense entries for one trip.",
    description: "Given tripNumber/tripId and optional category/date filters, returns matching expenses.",
    limitations: "An empty result is not proof of zero actual cost.",
    permissions: "Read-only; tenant-scoped.",
    exampleQuestions: ["Show fuel expenses for TRIP-1001.", "What toll costs were recorded for TRIP-1003?"],
    allowedRoles: new Set(["operator", "customer"]),
  },
  {
    name: "get_customer_trip_summary",
    run: getCustomerTripSummary.run as ToolSpec["run"],
    inputSchema: GetCustomerTripSummaryInput,
    outputSchema: GetCustomerTripSummaryOutput,
    purpose: "Summarize trip counts and financial performance per customer over a date range.",
    description: "Aggregates trip counts and financials per customer, optionally scoped to one customerId.",
    limitations: "Aggregates at most 500 trips per customer per call; a customer-role caller always gets only their own summary.",
    permissions: "Read-only; tenant-scoped.",
    exampleQuestions: ["Which customer generated the most billed revenue last month?", "Summarize my trips this quarter."],
    allowedRoles: new Set(["operator", "customer"]),
  },
  {
    name: "list_unpaid_invoices",
    run: listUnpaidInvoices.run as ToolSpec["run"],
    inputSchema: ListUnpaidInvoicesInput,
    outputSchema: ListUnpaidInvoicesOutput,
    purpose: "Find invoices that are unpaid or partially paid (or match an explicit status).",
    description: "Lists invoices with paymentStatus in {unpaid, partially_paid} by default, or an explicit status.",
    limitations: "Pagination applies; default scope excludes draft/cancelled.",
    permissions: "Read-only; tenant-scoped.",
    exampleQuestions: ["Show all unpaid and partially paid invoices.", "Which invoices are overdue?"],
    allowedRoles: new Set(["operator", "customer"]),
  },
  {
    name: "get_vehicle_utilization",
    run: getVehicleUtilization.run as ToolSpec["run"],
    inputSchema: GetVehicleUtilizationInput,
    outputSchema: GetVehicleUtilizationOutput,
    purpose: "Summarize trip counts and recorded distance per vehicle over a period.",
    description: "For each vehicle (or one vehicleId), reports tripCount and totalRecordedDistanceKm.",
    limitations: "Operator-only: internal fleet metric. Never computes a utilization percentage.",
    permissions: "Read-only; tenant-scoped; operator-only.",
    exampleQuestions: ["Which vehicles completed the most trips this quarter?"],
    allowedRoles: new Set(["operator"]),
  },
  {
    name: "get_driver_trip_history",
    run: getDriverTripHistory.run as ToolSpec["run"],
    inputSchema: GetDriverTripHistoryInput,
    outputSchema: GetDriverTripHistoryOutput,
    purpose: "Retrieve one driver's trip history, resolving by id or possibly-ambiguous name.",
    description: "Given driverId/driverName, returns that driver's trips. Ambiguous names return candidates, not a guess.",
    limitations: "Operator-only: driver-level data. When ambiguous, no trips are returned.",
    permissions: "Read-only; tenant-scoped; operator-only.",
    exampleQuestions: ["Show the trip history for driver Ramesh.", "How many trips has driver DRV-004 completed?"],
    allowedRoles: new Set(["operator"]),
  },
  {
    name: "compare_route_profitability",
    run: compareRouteProfitability.run as ToolSpec["run"],
    inputSchema: CompareRouteProfitabilityInput,
    outputSchema: CompareRouteProfitabilityOutput,
    purpose: "Compare directional routes by aggregate profit and profit-per-km.",
    description: "Groups trips by directional route; aggregateProfitPerKm = sum(profit)/sum(distance), never an average of ratios.",
    limitations: "Operator-only: compares across all customers. Aggregates at most 500 trips/call.",
    permissions: "Read-only; tenant-scoped; operator-only.",
    exampleQuestions: ["Which route had the highest profit per kilometre this month?"],
    allowedRoles: new Set(["operator"]),
  },
  {
    name: "search_logistics_documents",
    run: searchLogisticsDocuments.run as ToolSpec["run"],
    inputSchema: SearchLogisticsDocumentsInput,
    outputSchema: SearchLogisticsDocumentsOutput,
    purpose: "Retrieve relevant passages from policy/port-regulation documents via full-text search.",
    description:
      "Searches logistics_documents (tenant-private + global) using PostgreSQL full-text search, falling back " +
      "to keyword overlap. No embeddings/vector search in this backend.",
    limitations: "foundRelevantResults=false means no match was found - never invent an answer in that case.",
    permissions: "Read-only; tenant-private documents isolated from other tenants.",
    exampleQuestions: ["According to the applicable port policy, what documents are required for this shipment?"],
    allowedRoles: new Set(["operator", "customer"]),
  },
];

export const TOOL_REGISTRY: Map<string, ToolSpec> = new Map(TOOL_SPECS.map((t) => [t.name, t]));

export function getToolSpec(name: string): ToolSpec | undefined {
  return TOOL_REGISTRY.get(name);
}
