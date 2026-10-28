/** End-to-end request pipeline: question -> OKF-aware tool candidates ->
 * Gemini (or fake) planning -> plan validation -> controlled execution ->
 * result validation -> grounded final answer. Mirrors
 * app.orchestrator.pipeline in the Python sibling backend. This is the
 * only path by which a chat request reaches the database - the LLM
 * never gets a direct connection, and every tool call it can request is
 * schema-validated against src/mcp/registry.ts first.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AuthenticatedUser } from "../auth/models.js";
import type { KnowledgeBundle } from "../knowledge/types.js";
import { Planner, PlanValidationError } from "../planner/planner.js";
import type { ExecutionPlan } from "../planner/schemas.js";
import { describeGeminiFailure } from "../utils/geminiRetry.js";
import { generateAnswer } from "./answer.js";
import { executePlan, type ExecutionTrace } from "./executor.js";
import { getCandidateTools } from "./toolDiscovery.js";
import { validateTrace, type ValidationReport } from "./validator.js";

export interface ChatResult {
  requestId: string;
  answer: string;
  plan: ExecutionPlan;
  trace: ExecutionTrace;
  validation: ValidationReport;
}

export async function runChatPipeline(opts: {
  question: string;
  client: PoolClient;
  user: AuthenticatedUser;
  knowledgeBundle: KnowledgeBundle;
  planner?: Planner;
}): Promise<ChatResult> {
  const requestId = randomUUID();
  const planner = opts.planner ?? new Planner();

  const candidates = getCandidateTools(opts.user.role);

  let plan: ExecutionPlan;
  try {
    plan = await planner.buildPlan({ question: opts.question, candidateTools: candidates, role: opts.user.role });
  } catch (err) {
    if (err instanceof PlanValidationError) {
      plan = {
        intent: "Plan validation failed",
        requestedDeliverables: [],
        filters: {},
        selectedTools: [],
        expectedOutputs: [],
        clarificationRequired: false,
        clarificationQuestion: null,
        unsupportedReason: `The generated plan was rejected by validation: ${err.message}`,
      };
    } else {
      // Covers anything from the planner client itself - Gemini rate
      // limits/timeouts, malformed model output, transport errors, etc.
      // None of that should ever surface as a bare 500, and the raw
      // error (which may contain request internals) is logged
      // server-side only, never relayed into the user-visible answer.
      console.error(`[planner_failed] requestId=${requestId}`, err);
      plan = {
        intent: "Planner call failed",
        requestedDeliverables: [],
        filters: {},
        selectedTools: [],
        expectedOutputs: [],
        clarificationRequired: false,
        clarificationQuestion: null,
        unsupportedReason: `The planning step failed because ${describeGeminiFailure(err)}. Please try again in a moment.`,
      };
    }
  }

  const trace = await executePlan(plan, opts.client, opts.user);
  const report = validateTrace(trace);
  const answer = await generateAnswer({
    question: opts.question,
    plan,
    trace,
    report,
    knowledgeBundle: opts.knowledgeBundle,
  });

  return { requestId, answer, plan, trace, validation: report };
}
