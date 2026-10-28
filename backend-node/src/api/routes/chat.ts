import { Router } from "express";
import type { KnowledgeBundle } from "../../knowledge/types.js";
import { runChatPipeline } from "../../orchestrator/pipeline.js";
import { isFullyComplete } from "../../orchestrator/validator.js";
import { ChatRequestSchema, type ChatResponse } from "../../schemas/chat.js";
import { requireUser } from "../../auth/dependencies.js";
import { withScopedClient } from "../middleware/scopedClient.js";
import { toSnakeCase } from "../caseTransform.js";

export function createChatRouter(knowledgeBundle: KnowledgeBundle): Router {
  const router = Router();

  router.post("/api/v1/chat", requireUser, withScopedClient, async (req, res) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ detail: parsed.error.message });
      return;
    }

    const result = await runChatPipeline({
      question: parsed.data.message,
      client: req.dbClient!,
      user: req.user!,
      knowledgeBundle,
    });

    console.log(
      JSON.stringify({
        event: "chat_request",
        requestId: result.requestId,
        tenantId: req.user!.tenantId,
        selectedTools: result.trace.steps.map((s) => s.toolName),
        stepStatuses: result.trace.steps.map((s) => ({ stepId: s.stepId, status: s.status })),
        fullyComplete: isFullyComplete(result.validation),
      }),
    );

    const response: ChatResponse = {
      requestId: result.requestId,
      answer: result.answer,
      intent: result.plan.intent,
      toolExecutions: result.trace.steps.map((s) => ({
        stepId: s.stepId,
        toolName: s.toolName,
        status: s.status,
        durationMs: Math.round(s.durationMs * 10) / 10,
        error: s.error,
        output: s.output,
      })),
      isFullyComplete: isFullyComplete(result.validation),
      validationNotes: result.validation.issues,
      unsupportedReason: result.plan.unsupportedReason,
      clarificationRequired: result.plan.clarificationRequired,
    };
    res.json(toSnakeCase(response));
  });

  return router;
}
