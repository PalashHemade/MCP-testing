/** Controlled execution of a validated ExecutionPlan - mirrors
 * app.orchestrator.executor in the Python sibling backend. Independent
 * steps (no unmet dependsOn) run concurrently via Promise.all; each
 * dependency layer waits for the previous one. Each step gets a bounded
 * timeout and one bounded retry on a transient failure - never on a
 * validation error, which is not transient.
 */
import type { PoolClient } from "pg";
import type { AuthenticatedUser } from "../auth/models.js";
import { TOOL_REGISTRY } from "../mcp/registry.js";
import type { ExecutionPlan, ToolCall } from "../planner/schemas.js";

const STEP_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;

export interface StepResult {
  stepId: string;
  toolName: string;
  status: "success" | "error";
  output: Record<string, unknown> | null;
  error: string | null;
  durationMs: number;
}

export interface ExecutionTrace {
  steps: StepResult[];
}

function resolveReference(value: unknown, resultsByStep: Map<string, Record<string, unknown>>): unknown {
  if (typeof value !== "string" || !value.startsWith("$result.")) return value;
  const [, stepId, ...pathParts] = value.split(".");
  const stepOutput = resultsByStep.get(stepId!);
  if (!stepOutput) {
    throw new Error(`Cannot resolve reference '${value}': step '${stepId}' has no result`);
  }
  let current: unknown = stepOutput;
  for (const part of pathParts) {
    if (current !== null && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      throw new Error(`Cannot resolve reference '${value}': path '${part}' not found`);
    }
  }
  return current;
}

function resolveArguments(
  args: Record<string, unknown>,
  resultsByStep: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    resolved[key] = resolveReference(value, resultsByStep);
  }
  return resolved;
}

/** Sanitizes a tool-step failure for the trace shown to the end user (and
 * fed back into the final-answer prompt). A Zod validation failure is
 * caller-correctable signal worth keeping; everything else (DB
 * connection drops, driver errors, our own timeout) is collapsed to a
 * short, safe, retryable-sounding message - the real `err` is always
 * logged server-side by the caller first. */
function describeStepFailure(toolName: string, err: unknown): string {
  if (err instanceof Error && err.name === "ZodError") {
    return `invalid arguments for '${toolName}': ${err.message}`;
  }
  if (err instanceof Error && /timed out/i.test(err.message)) {
    return `'${toolName}' did not respond in time - the database may be temporarily overloaded. Please try again.`;
  }
  return `'${toolName}' failed due to a temporary issue. Please try again.`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function runStep(
  call: ToolCall,
  client: PoolClient,
  user: AuthenticatedUser,
  resultsByStep: Map<string, Record<string, unknown>>,
): Promise<StepResult> {
  const spec = TOOL_REGISTRY.get(call.toolName)!; // presence guaranteed by Planner.validate
  const started = performance.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const resolvedArgs = resolveArguments(call.arguments, resultsByStep);
      const parsed = spec.inputSchema.parse(resolvedArgs);
      const output = await withTimeout(
        spec.run(client, user, parsed),
        STEP_TIMEOUT_MS,
        `tool '${call.toolName}' timed out after ${STEP_TIMEOUT_MS}ms`,
      );
      return {
        stepId: call.stepId,
        toolName: call.toolName,
        status: "success",
        output: output as Record<string, unknown>,
        error: null,
        durationMs: performance.now() - started,
      };
    } catch (err) {
      if (attempt < MAX_RETRIES && !(err instanceof Error && err.name === "ZodError")) {
        continue;
      }
      console.error(`[tool_step_failed] tool=${call.toolName} step=${call.stepId}`, err);
      return {
        stepId: call.stepId,
        toolName: call.toolName,
        status: "error",
        output: null,
        error: describeStepFailure(call.toolName, err),
        durationMs: performance.now() - started,
      };
    }
  }
  throw new Error("unreachable"); // pragma: no cover
}

export async function executePlan(
  plan: ExecutionPlan,
  client: PoolClient,
  user: AuthenticatedUser,
): Promise<ExecutionTrace> {
  const trace: ExecutionTrace = { steps: [] };
  const resultsByStep = new Map<string, Record<string, unknown>>();
  let remaining = [...plan.selectedTools];

  while (remaining.length > 0) {
    const ready = remaining.filter((c) => c.dependsOn.every((dep) => resultsByStep.has(dep)));
    if (ready.length === 0) {
      for (const call of remaining) {
        trace.steps.push({
          stepId: call.stepId,
          toolName: call.toolName,
          status: "error",
          output: null,
          error: "unresolvable dependency ordering",
          durationMs: 0,
        });
      }
      break;
    }

    const stepResults = await Promise.all(ready.map((call) => runStep(call, client, user, resultsByStep)));
    for (const result of stepResults) {
      trace.steps.push(result);
      if (result.status === "success" && result.output) {
        resultsByStep.set(result.stepId, result.output);
      }
    }

    const readyIds = new Set(ready.map((c) => c.stepId));
    remaining = remaining.filter((c) => !readyIds.has(c.stepId));
  }

  return trace;
}
