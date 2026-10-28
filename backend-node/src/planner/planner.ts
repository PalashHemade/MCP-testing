import { getSettings } from "../config/settings.js";
import { TOOL_REGISTRY } from "../mcp/registry.js";
import type { Role } from "../auth/models.js";
import type { PlannerClient, ToolCandidate } from "./base.js";
import { FakePlannerClient } from "./fakePlannerClient.js";
import { GeminiPlannerClient } from "./geminiClient.js";
import type { ExecutionPlan } from "./schemas.js";

export class PlanValidationError extends Error {}

export function getPlannerClient(): PlannerClient {
  const settings = getSettings();
  return settings.geminiAvailable ? new GeminiPlannerClient() : new FakePlannerClient();
}

/** Produces and validates an ExecutionPlan. Validation here is what
 * actually prevents the LLM from invoking unregistered tools, a
 * role-inappropriate tool, or malformed arguments - the planner
 * client's output is never trusted on its own. Mirrors
 * app.planner.planner.Planner in the Python sibling backend.
 */
export class Planner {
  constructor(private readonly client: PlannerClient = getPlannerClient()) {}

  async buildPlan(opts: {
    question: string;
    candidateTools: ToolCandidate[];
    role: Role;
    today?: string;
  }): Promise<ExecutionPlan> {
    const today = opts.today ?? new Date().toISOString().slice(0, 10);
    const plan = await this.client.createPlan({
      question: opts.question,
      candidateTools: opts.candidateTools,
      today,
    });
    this.validate(plan, opts.candidateTools, opts.role);
    return plan;
  }

  private validate(plan: ExecutionPlan, candidateTools: ToolCandidate[], role: Role): void {
    const candidateNames = new Set(candidateTools.map((c) => c.name));
    const seenSteps = new Set<string>();

    for (const call of plan.selectedTools) {
      const spec = TOOL_REGISTRY.get(call.toolName);
      if (!spec) {
        throw new PlanValidationError(`Plan selected an unregistered tool: '${call.toolName}'`);
      }
      if (!spec.allowedRoles.has(role)) {
        throw new PlanValidationError(`Role '${role}' is not permitted to use tool '${call.toolName}'`);
      }
      if (!candidateNames.has(call.toolName)) {
        throw new PlanValidationError(
          `Plan selected '${call.toolName}', which was not offered as a retrieved candidate`,
        );
      }
      const result = spec.inputSchema.safeParse(call.arguments);
      if (!result.success) {
        throw new PlanValidationError(
          `Invalid arguments for tool '${call.toolName}': ${result.error.message}`,
        );
      }
      if (seenSteps.has(call.stepId)) {
        throw new PlanValidationError(`Duplicate stepId in plan: '${call.stepId}'`);
      }
      seenSteps.add(call.stepId);
    }

    for (const call of plan.selectedTools) {
      for (const dep of call.dependsOn) {
        if (!seenSteps.has(dep)) {
          throw new PlanValidationError(`Step '${call.stepId}' dependsOn unknown step '${dep}'`);
        }
        if (dep === call.stepId) {
          throw new PlanValidationError(`Step '${call.stepId}' cannot depend on itself`);
        }
      }
    }
  }
}
