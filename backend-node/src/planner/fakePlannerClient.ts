/** Deterministic, rule-based stand-in for GeminiPlannerClient - used
 * automatically whenever GEMINI_API_KEY is unset, and always in tests
 * so CI needs no network access or paid quota. Mirrors
 * app.planner.fake_gemini_client in the Python sibling backend: a small
 * keyword/pattern engine covering the demo's example questions and the
 * planner evaluation set, which declines rather than guessing outside
 * that coverage.
 */
import { parseRelativeDateRange } from "./dateParsing.js";
import type { PlannerClient, ToolCandidate } from "./base.js";
import type { ExecutionPlan, ToolCall } from "./schemas.js";

const TRIP_NUMBER_RE = /\bTRIP-\d+\b/i;

const SECURITY_BYPASS_PHRASES = [
  "ignore tenant restrictions",
  "ignore authorization",
  "ignore your instructions",
  "bypass tenant",
  "show me all customers",
  "show all customers' invoices",
];

const DOCUMENT_KEYWORDS = ["policy", "regulation", "port rule", "documentation required", "documents required"];
const FINANCIAL_KEYWORDS = ["profit", "cost", "expense", "billing", "invoice", "paid", "revenue", "outstanding"];
const EXPENSE_ONLY_KEYWORDS = ["fuel", "toll", "loading", "allowance", "maintenance expense", "expenses"];
const UNPAID_KEYWORDS = ["unpaid", "overdue", "outstanding balance", "partially paid"];
const CUSTOMER_KEYWORDS = ["customer"];
const VEHICLE_KEYWORDS = ["vehicle", "truck"];
const DRIVER_KEYWORDS = ["driver"];
const ROUTE_KEYWORDS = ["route", "profit per kilometre", "profit per km"];

export class FakePlannerClient implements PlannerClient {
  async createPlan(opts: {
    question: string;
    candidateTools: ToolCandidate[];
    today: string;
  }): Promise<ExecutionPlan> {
    const lowered = opts.question.toLowerCase();
    const names = new Set(opts.candidateTools.map((c) => c.name));

    if (SECURITY_BYPASS_PHRASES.some((p) => lowered.includes(p))) {
      return {
        intent: "Refused: request attempts to bypass tenant authorization.",
        requestedDeliverables: [],
        filters: {},
        selectedTools: [],
        expectedOutputs: [],
        clarificationRequired: false,
        clarificationQuestion: null,
        unsupportedReason:
          "This request asks to ignore tenant/authorization restrictions. Tenant scope is " +
          "enforced server-side and cannot be overridden by a user request; no cross-tenant " +
          "data can be disclosed.",
      };
    }

    const today = new Date(opts.today);
    const [startDate, endDate] = parseRelativeDateRange(opts.question, today);
    const filters: Record<string, unknown> = {};
    if (startDate && endDate) {
      filters.startDate = startDate;
      filters.endDate = endDate;
    }

    const tripMatch = opts.question.match(TRIP_NUMBER_RE);
    const wantsDocument = DOCUMENT_KEYWORDS.some((k) => lowered.includes(k));
    const wantsFinancial = FINANCIAL_KEYWORDS.some((k) => lowered.includes(k));
    const wantsExpensesOnly = EXPENSE_ONLY_KEYWORDS.some((k) => lowered.includes(k)) && !lowered.includes("profit");

    const steps: ToolCall[] = [];
    let stepCounter = 0;
    const nextStepId = () => `step_${++stepCounter}`;

    // Once a specific trip is named, that single-trip tool is both
    // necessary AND sufficient - the aggregate/fleet-wide tools below are
    // all gated on `!tripMatch` so a stray "vehicle"/"driver"/"customer"
    // keyword in a single-trip question (e.g. "Who was the driver for
    // TRIP-1001?") can't also bolt on an unrelated, noisier tool call.
    if (tripMatch) {
      const tripNumber = tripMatch[0].toUpperCase();
      if (wantsExpensesOnly && names.has("get_trip_expenses")) {
        steps.push({ stepId: nextStepId(), toolName: "get_trip_expenses", arguments: { tripNumber }, dependsOn: [] });
      } else if (wantsFinancial && names.has("get_trip_financials")) {
        steps.push({ stepId: nextStepId(), toolName: "get_trip_financials", arguments: { tripNumber }, dependsOn: [] });
      } else if (names.has("get_trip_details")) {
        steps.push({ stepId: nextStepId(), toolName: "get_trip_details", arguments: { tripNumber }, dependsOn: [] });
      }
    }

    if (UNPAID_KEYWORDS.some((k) => lowered.includes(k)) && names.has("list_unpaid_invoices")) {
      steps.push({ stepId: nextStepId(), toolName: "list_unpaid_invoices", arguments: { ...filters }, dependsOn: [] });
    }

    if (!tripMatch && CUSTOMER_KEYWORDS.some((k) => lowered.includes(k)) && wantsFinancial && names.has("get_customer_trip_summary")) {
      steps.push({ stepId: nextStepId(), toolName: "get_customer_trip_summary", arguments: { ...filters }, dependsOn: [] });
    }

    if (!tripMatch && VEHICLE_KEYWORDS.some((k) => lowered.includes(k)) && names.has("get_vehicle_utilization")) {
      steps.push({ stepId: nextStepId(), toolName: "get_vehicle_utilization", arguments: { ...filters }, dependsOn: [] });
    }

    if (!tripMatch && DRIVER_KEYWORDS.some((k) => lowered.includes(k)) && names.has("get_driver_trip_history")) {
      const nameMatch = opts.question.match(/driver\s+([A-Za-z][A-Za-z\s]{1,40})/i);
      const driverName = nameMatch?.[1]?.trim().replace(/[.?,]+$/, "");
      if (driverName) {
        steps.push({
          stepId: nextStepId(),
          toolName: "get_driver_trip_history",
          arguments: { ...filters, driverName },
          dependsOn: [],
        });
      }
    }

    if (!tripMatch && ROUTE_KEYWORDS.some((k) => lowered.includes(k)) && names.has("compare_route_profitability")) {
      steps.push({ stepId: nextStepId(), toolName: "compare_route_profitability", arguments: { ...filters }, dependsOn: [] });
    }

    if (!tripMatch && steps.length === 0 && !wantsDocument && (lowered.includes("trip") || lowered.includes("transit")) && names.has("list_trips")) {
      const args: Record<string, unknown> = { ...filters };
      if (lowered.includes("in transit")) args.tripStatus = "in_transit";
      else if (lowered.includes("completed")) args.tripStatus = "completed";
      steps.push({ stepId: nextStepId(), toolName: "list_trips", arguments: args, dependsOn: [] });
    }

    if (wantsDocument && steps.length === 0 && lowered.includes("most profitable") && names.has("compare_route_profitability")) {
      steps.push({ stepId: nextStepId(), toolName: "compare_route_profitability", arguments: { ...filters }, dependsOn: [] });
    }

    if (wantsDocument && names.has("search_logistics_documents")) {
      steps.push({
        stepId: nextStepId(),
        toolName: "search_logistics_documents",
        arguments: { query: opts.question },
        dependsOn: [],
      });
    }

    if (steps.length === 0) {
      return {
        intent: "Could not confidently map this question to a registered tool.",
        requestedDeliverables: [],
        filters: {},
        selectedTools: [],
        expectedOutputs: [],
        clarificationRequired: false,
        clarificationQuestion: null,
        unsupportedReason:
          "This deterministic fallback planner did not recognize a supported intent in the " +
          "question. A live Gemini planner may handle a broader range of phrasing; configure " +
          "GEMINI_API_KEY to enable it.",
      };
    }

    return {
      intent: opts.question.slice(0, 200),
      requestedDeliverables: steps.map((s) => s.toolName),
      filters,
      selectedTools: steps,
      expectedOutputs: steps.map((s) => s.toolName),
      clarificationRequired: false,
      clarificationQuestion: null,
      unsupportedReason: null,
    };
  }
}
