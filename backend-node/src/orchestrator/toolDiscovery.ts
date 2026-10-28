/** Deterministic tool discovery - NO embeddings, NO vector search, NO
 * ranking system, per the project brief for this backend. With only 10
 * registered tools (≤7 per role), every tool the caller's role is
 * allowed to use is simply offered as a candidate every time; OKF
 * (src/knowledge) supplies the descriptive text, and
 * app.mcp.registry.allowedRoles is the actual gate (re-checked again,
 * independently, in Planner.validate).
 */
import type { Role } from "../auth/models.js";
import { TOOL_SPECS } from "../mcp/registry.js";
import type { ToolCandidate } from "../planner/base.js";
import { toCompactSchema } from "../planner/schemaToGemini.js";

export function getCandidateTools(role: Role): ToolCandidate[] {
  return TOOL_SPECS.filter((spec) => spec.allowedRoles.has(role)).map((spec) => ({
    name: spec.name,
    purpose: spec.purpose,
    description: spec.description,
    inputSchema: toCompactSchema(spec.inputSchema),
    limitations: spec.limitations,
    exampleQuestions: spec.exampleQuestions,
  }));
}
