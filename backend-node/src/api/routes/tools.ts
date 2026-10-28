import { Router } from "express";
import { z } from "zod";
import { getSettings } from "../../config/settings.js";
import { requireUser } from "../../auth/dependencies.js";
import { TOOL_REGISTRY, type ToolSpec } from "../../mcp/registry.js";
import { withScopedClient } from "../middleware/scopedClient.js";
import { toSnakeCase } from "../caseTransform.js";

export const toolsRouter = Router();

// Built by hand with snake_case keys (matching the existing frontend's
// wire contract - see api/caseTransform.ts) rather than via the generic
// recursive transformer: `inputSchema`'s VALUE is a raw JSON Schema
// object whose own keywords (minLength, additionalProperties, ...) must
// never be mangled by a blind camelCase->snake_case pass.
function toolMetadata(spec: ToolSpec): Record<string, unknown> {
  return {
    name: spec.name,
    purpose: spec.purpose,
    description: spec.description,
    input_schema: z.toJSONSchema(spec.inputSchema),
    limitations: spec.limitations,
    permissions: spec.permissions,
    example_questions: spec.exampleQuestions,
  };
}

toolsRouter.get("/api/v1/tools", requireUser, (req, res) => {
  const role = req.user!.role;
  const tools = [...TOOL_REGISTRY.values()].filter((spec) => spec.allowedRoles.has(role)).map(toolMetadata);
  res.json(tools);
});

toolsRouter.get("/api/v1/tools/:toolName", requireUser, (req, res) => {
  const toolName = String(req.params.toolName);
  const spec = TOOL_REGISTRY.get(toolName);
  // Same 404 whether the tool doesn't exist or this role just can't see
  // it - never reveal that an operator-only tool exists to a customer.
  if (!spec || !spec.allowedRoles.has(req.user!.role)) {
    res.status(404).json({ detail: `Unknown tool '${toolName}'` });
    return;
  }
  res.json(toolMetadata(spec));
});

toolsRouter.post("/api/v1/tools/:toolName/execute", requireUser, withScopedClient, async (req, res) => {
  const settings = getSettings();
  if (settings.isProduction) {
    res.status(403).json({ detail: "Direct tool execution is disabled when APP_ENV=production." });
    return;
  }

  const toolName = String(req.params.toolName);
  const spec = TOOL_REGISTRY.get(toolName);
  if (!spec || !spec.allowedRoles.has(req.user!.role)) {
    res.status(404).json({ detail: `Unknown tool '${toolName}'` });
    return;
  }

  const parsed = spec.inputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ detail: parsed.error.message });
    return;
  }

  // No try/catch here - an unexpected failure falls through to the
  // global error handler in app.ts, which logs the real error
  // server-side and returns a generic message, never raw internals.
  const output = await spec.run(req.dbClient!, req.user!, parsed.data);
  res.json(toSnakeCase(output));
});
