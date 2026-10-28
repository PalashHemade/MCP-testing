import { z } from "zod";

/** The REAL execution plan, used internally (validation, orchestrator,
 * tests). `arguments`/`filters` are real objects here - the Gemini-
 * facing mirror schemas below encode them as JSON strings instead, to
 * work around the Developer API's rejection of `additionalProperties`
 * (see schemaToGemini.ts). This is the only channel through which the
 * LLM can cause backend action - it names registered tools and
 * arguments, never arbitrary code or SQL.
 */
export const ToolCallSchema = z.object({
  stepId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.string(), z.unknown()).default({}),
  dependsOn: z.array(z.string()).default([]),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ExecutionPlanSchema = z.object({
  intent: z.string(),
  requestedDeliverables: z.array(z.string()).default([]),
  filters: z.record(z.string(), z.unknown()).default({}),
  selectedTools: z.array(ToolCallSchema).default([]),
  expectedOutputs: z.array(z.string()).default([]),
  clarificationRequired: z.boolean().default(false),
  clarificationQuestion: z.string().nullable().default(null),
  unsupportedReason: z.string().nullable().default(null),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

/** Gemini-facing mirror: arguments/filters as JSON-encoded strings. */
export const GeminiToolCallSchema = z.object({
  stepId: z.string(),
  toolName: z.string(),
  argumentsJson: z
    .string()
    .default("{}")
    .describe('JSON-encoded object string of arguments matching the tool\'s input schema, e.g. \'{"tripNumber": "TRIP-1001"}\'. Use "{}" for none.'),
  dependsOn: z.array(z.string()).default([]),
});

export const GeminiExecutionPlanSchema = z.object({
  intent: z.string(),
  requestedDeliverables: z.array(z.string()).default([]),
  filtersJson: z
    .string()
    .default("{}")
    .describe('JSON-encoded object string of extracted filters, e.g. \'{"startDate": "2026-01-01"}\'. Use "{}" if none.'),
  selectedTools: z.array(GeminiToolCallSchema).default([]),
  expectedOutputs: z.array(z.string()).default([]),
  clarificationRequired: z.boolean().default(false),
  clarificationQuestion: z.string().nullable().default(null),
  unsupportedReason: z.string().nullable().default(null),
});
export type GeminiExecutionPlan = z.infer<typeof GeminiExecutionPlanSchema>;

function parseJsonObject(raw: string, fieldName: string): Record<string, unknown> {
  if (!raw) return {};
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON in ${fieldName}: ${raw} (${String(err)})`);
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw new Error(`Gemini's ${fieldName} must decode to a JSON object, got: ${raw}`);
  }
  return decoded as Record<string, unknown>;
}

export function toExecutionPlan(plan: GeminiExecutionPlan): ExecutionPlan {
  return {
    intent: plan.intent,
    requestedDeliverables: plan.requestedDeliverables,
    filters: parseJsonObject(plan.filtersJson, "filtersJson"),
    selectedTools: plan.selectedTools.map((call) => ({
      stepId: call.stepId,
      toolName: call.toolName,
      arguments: parseJsonObject(call.argumentsJson, "argumentsJson"),
      dependsOn: call.dependsOn,
    })),
    expectedOutputs: plan.expectedOutputs,
    clarificationRequired: plan.clarificationRequired,
    clarificationQuestion: plan.clarificationQuestion,
    unsupportedReason: plan.unsupportedReason,
  };
}
