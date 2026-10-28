/** Converts a Zod schema to the restricted JSON-Schema subset Gemini's
 * Developer API accepts as `responseSchema`. Zod v4's `z.toJSONSchema()`
 * adds `additionalProperties: false` and `$schema` by default, both of
 * which Gemini's Developer API (unlike Vertex AI) rejects outright with
 * a 400 ("additionalProperties is only supported in Gemini Enterprise
 * Agent Platform mode, not in Gemini Developer API mode") - this strips
 * every key Gemini's schema subset doesn't support, recursively.
 */
import { z } from "zod";

const UNSUPPORTED_KEYS = new Set(["additionalProperties", "$schema", "default"]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripUnsupported);
  }
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (UNSUPPORTED_KEYS.has(key)) continue;
      out[key] = stripUnsupported(value);
    }
    return out;
  }
  return node;
}

export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema);
  return stripUnsupported(jsonSchema) as Record<string, unknown>;
}

/** Same cleanup, for embedding a tool's input schema as prompt TEXT
 * (candidate tool display) rather than as Gemini's structured
 * `responseSchema` - not subject to the Developer API's restrictions,
 * but the same keys are just noise for a human/LLM reading the prompt. */
export function toCompactSchema(schema: z.ZodType): Record<string, unknown> {
  return toGeminiSchema(schema);
}
