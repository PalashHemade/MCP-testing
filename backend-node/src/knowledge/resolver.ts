/** Deterministic knowledge resolution for the planner prompt - no
 * ranking, no embeddings. For the 10-tool catalogue, direct loading of
 * every allowed tool's short description is acceptable per the project
 * brief; this also respects a configurable context-size budget so a
 * misconfigured bundle can't blow up the prompt.
 */
import type { ConceptFile, KnowledgeBundle } from "./types.js";

export interface ResolvedKnowledge {
  text: string;
  loadedPaths: string[];
  skippedForBudget: string[];
}

function conceptsOfType(bundle: KnowledgeBundle, type: string): ConceptFile[] {
  return [...bundle.concepts.values()].filter((c) => c.type === type);
}

function toolConceptName(concept: ConceptFile): string {
  const title = concept.frontmatter["title"];
  return typeof title === "string" ? title : concept.conceptId.split("/").pop()!;
}

/** Loads the knowledge for exactly the tools the caller's role may use -
 * this is the OKF equivalent of what the Python/FastAPI sibling backend
 * does with embedding-based retrieval, but deterministic: no similarity
 * search, just "which tool concepts are allowed for this role."
 */
export function resolveToolKnowledge(
  bundle: KnowledgeBundle,
  allowedToolNames: Set<string>,
  maxContextChars: number,
): ResolvedKnowledge {
  const toolConcepts = conceptsOfType(bundle, "tool").filter((c) =>
    allowedToolNames.has(toolConceptName(c)),
  );

  const loadedPaths: string[] = [];
  const skippedForBudget: string[] = [];
  const parts: string[] = [];
  let usedChars = 0;

  for (const concept of toolConcepts) {
    const chunk = `## ${concept.conceptId}\n${concept.body.trim()}\n`;
    if (usedChars + chunk.length > maxContextChars) {
      skippedForBudget.push(concept.conceptId);
      continue;
    }
    parts.push(chunk);
    loadedPaths.push(concept.conceptId);
    usedChars += chunk.length;
  }

  return { text: parts.join("\n"), loadedPaths, skippedForBudget };
}

/** Loads every metric concept - small, fixed set (5 files), always
 * loaded in full for the planner/answer-generation prompts since the
 * financial definitions must be applied consistently regardless of
 * which tools were selected. */
export function resolveAllMetrics(bundle: KnowledgeBundle): ResolvedKnowledge {
  const metrics = conceptsOfType(bundle, "metric");
  const loadedPaths = metrics.map((m) => m.conceptId);
  const text = metrics.map((m) => `## ${m.conceptId}\n${m.body.trim()}\n`).join("\n");
  return { text, loadedPaths, skippedForBudget: [] };
}
