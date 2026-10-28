import { describe, expect, it } from "vitest";
import { getCandidateTools } from "../../src/orchestrator/toolDiscovery.js";
import { Planner, PlanValidationError } from "../../src/planner/planner.js";
import type { PlannerClient, ToolCandidate } from "../../src/planner/base.js";
import type { ExecutionPlan } from "../../src/planner/schemas.js";

class FixedClient implements PlannerClient {
  constructor(private readonly plan: ExecutionPlan) {}
  async createPlan(): Promise<ExecutionPlan> {
    return this.plan;
  }
}

function basePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    intent: "test",
    requestedDeliverables: [],
    filters: {},
    selectedTools: [],
    expectedOutputs: [],
    clarificationRequired: false,
    clarificationQuestion: null,
    unsupportedReason: null,
    ...overrides,
  };
}

const operatorCandidates: ToolCandidate[] = getCandidateTools("operator");
const customerCandidates: ToolCandidate[] = getCandidateTools("customer");

describe("Planner.buildPlan validation", () => {
  it("rejects an unregistered tool", async () => {
    const plan = basePlan({
      selectedTools: [{ stepId: "s1", toolName: "drop_all_tables", arguments: {}, dependsOn: [] }],
    });
    const planner = new Planner(new FixedClient(plan));
    await expect(
      planner.buildPlan({ question: "x", candidateTools: operatorCandidates, role: "operator" }),
    ).rejects.toThrow(PlanValidationError);
  });

  it("rejects a tool not among the retrieved candidates", async () => {
    const plan = basePlan({
      selectedTools: [{ stepId: "s1", toolName: "list_unpaid_invoices", arguments: {}, dependsOn: [] }],
    });
    const planner = new Planner(new FixedClient(plan));
    await expect(
      planner.buildPlan({
        question: "x",
        candidateTools: operatorCandidates.filter((c) => c.name === "list_trips"),
        role: "operator",
      }),
    ).rejects.toThrow(/not offered/);
  });

  it("rejects invalid arguments", async () => {
    const plan = basePlan({
      selectedTools: [{ stepId: "s1", toolName: "list_trips", arguments: { tripStatus: "not_real" }, dependsOn: [] }],
    });
    const planner = new Planner(new FixedClient(plan));
    await expect(
      planner.buildPlan({ question: "x", candidateTools: operatorCandidates, role: "operator" }),
    ).rejects.toThrow(/Invalid arguments/);
  });

  it("rejects duplicate step ids", async () => {
    const plan = basePlan({
      selectedTools: [
        { stepId: "s1", toolName: "list_trips", arguments: {}, dependsOn: [] },
        { stepId: "s1", toolName: "list_trips", arguments: {}, dependsOn: [] },
      ],
    });
    const planner = new Planner(new FixedClient(plan));
    await expect(
      planner.buildPlan({ question: "x", candidateTools: operatorCandidates, role: "operator" }),
    ).rejects.toThrow(/Duplicate stepId/);
  });

  it("rejects an unknown dependency", async () => {
    const plan = basePlan({
      selectedTools: [{ stepId: "s1", toolName: "list_trips", arguments: {}, dependsOn: ["ghost"] }],
    });
    const planner = new Planner(new FixedClient(plan));
    await expect(
      planner.buildPlan({ question: "x", candidateTools: operatorCandidates, role: "operator" }),
    ).rejects.toThrow(/unknown step/);
  });

  it("accepts a valid plan", async () => {
    const plan = basePlan({
      selectedTools: [{ stepId: "s1", toolName: "list_trips", arguments: { tripStatus: "in_transit" }, dependsOn: [] }],
    });
    const planner = new Planner(new FixedClient(plan));
    const result = await planner.buildPlan({ question: "x", candidateTools: operatorCandidates, role: "operator" });
    expect(result).toBe(plan);
  });

  it("rejects an operator-only tool for the customer role", async () => {
    const plan = basePlan({
      selectedTools: [{ stepId: "s1", toolName: "get_vehicle_utilization", arguments: {}, dependsOn: [] }],
    });
    const planner = new Planner(new FixedClient(plan));
    await expect(
      planner.buildPlan({ question: "x", candidateTools: operatorCandidates, role: "customer" }),
    ).rejects.toThrow(/not permitted/);
  });
});

describe("getCandidateTools role filtering", () => {
  it("never offers operator-only tools to the customer role", () => {
    const names = new Set(customerCandidates.map((c) => c.name));
    expect(names.has("get_vehicle_utilization")).toBe(false);
    expect(names.has("get_driver_trip_history")).toBe(false);
    expect(names.has("compare_route_profitability")).toBe(false);
  });

  it("offers operator-only tools to the operator role", () => {
    const names = new Set(operatorCandidates.map((c) => c.name));
    expect(names.has("get_vehicle_utilization")).toBe(true);
  });
});
