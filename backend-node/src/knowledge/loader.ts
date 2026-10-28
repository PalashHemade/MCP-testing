/** OKF v0.2 bundle loader - see docs/okf.md for the verified spec this
 * implements against (GoogleCloudPlatform/open-knowledge-format,
 * SPEC.md). Deliberately simple per the project brief: "Do not build a
 * complex ranking system unnecessarily. Use clear navigation and
 * deterministic file resolution." No embeddings, no ranking - a flat
 * walk of the bundle plus explicit link checks.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import matter from "gray-matter";
import type { KnowledgeBundle, ValidationIssue } from "./types.js";

const RESERVED_FILENAMES = new Set(["index.md", "log.md"]);
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;

function walkMarkdownFiles(root: string): string[] {
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
      } else if (entry.endsWith(".md")) {
        results.push(full);
      }
    }
  }
  return results;
}

/** Resolves root to an absolute path and asserts every loaded file stays
 * within it - prevents a maliciously/accidentally crafted link or a
 * misconfigured KNOWLEDGE_ROOT from reading files outside the bundle. */
function assertWithinRoot(root: string, absolutePath: string): void {
  const rel = relative(root, absolutePath);
  if (rel.startsWith("..") || rel.startsWith(sep)) {
    throw new Error(`Refusing to load path outside knowledge root: ${absolutePath}`);
  }
}

function extractLinks(body: string): string[] {
  const links: string[] = [];
  for (const match of body.matchAll(LINK_RE)) {
    const target = match[1];
    if (target) links.push(target);
  }
  return links;
}

export function loadBundle(rootInput: string): KnowledgeBundle {
  const root = resolve(rootInput);
  const bundle: KnowledgeBundle = { root, concepts: new Map(), indexes: new Map() };

  for (const absolutePath of walkMarkdownFiles(root)) {
    assertWithinRoot(root, absolutePath);
    const filename = absolutePath.split(sep).pop()!;
    const conceptId = relative(root, absolutePath).replace(/\.md$/, "").split(sep).join("/");
    const raw = readFileSync(absolutePath, "utf-8");

    if (RESERVED_FILENAMES.has(filename)) {
      if (filename === "index.md") {
        const parsed = matter(raw);
        const isRoot = relative(root, absolutePath) === "index.md";
        bundle.indexes.set(conceptId, {
          conceptId,
          absolutePath,
          okfVersion: isRoot ? (parsed.data["okf_version"] as string | undefined) : undefined,
          body: parsed.content,
        });
      }
      // log.md intentionally not modeled - not used by this project.
      continue;
    }

    const parsed = matter(raw);
    const type = parsed.data["type"];
    bundle.concepts.set(conceptId, {
      conceptId,
      absolutePath,
      frontmatter: parsed.data,
      type: typeof type === "string" ? type : "",
      body: parsed.content,
      links: extractLinks(parsed.content),
    });
  }

  return bundle;
}

/** OKF conformance checks (per SPEC.md "Conformance and validation"):
 * every non-reserved .md file must have parseable frontmatter with a
 * non-empty `type`. Unknown types, missing optional fields, and broken
 * links must NOT be rejected (the spec explicitly tolerates them) - they
 * are reported as warnings for visibility, never errors. This project
 * adds its own stricter check on top: every tool-type concept's
 * filename must correspond to a real registered tool (see
 * src/mcp/registry.ts), since OKF describing a nonexistent tool would be
 * actively misleading to the planner.
 */
export function validateBundle(
  bundle: KnowledgeBundle,
  registeredToolNames: Set<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenToolNames = new Map<string, string>();

  for (const concept of bundle.concepts.values()) {
    if (!concept.type) {
      issues.push({
        severity: "error",
        path: concept.conceptId,
        message: "Missing or empty required frontmatter field 'type'",
      });
    }

    if (concept.type === "tool") {
      const title = concept.frontmatter["title"];
      const toolName = typeof title === "string" ? title : concept.conceptId.split("/").pop()!;
      if (!registeredToolNames.has(toolName)) {
        issues.push({
          severity: "error",
          path: concept.conceptId,
          message: `Tool knowledge file documents '${toolName}', which is not a registered tool`,
        });
      }
      const existing = seenToolNames.get(toolName);
      if (existing) {
        issues.push({
          severity: "error",
          path: concept.conceptId,
          message: `Duplicate tool documentation for '${toolName}' (also at ${existing})`,
        });
      } else {
        seenToolNames.set(toolName, concept.conceptId);
      }
    }

    for (const link of concept.links) {
      if (!link.startsWith("/")) continue; // relative links not checked here
      const linkConceptId = link.replace(/^\//, "").replace(/\.md$/, "");
      const isIndex = link.endsWith("index.md");
      if (!isIndex && !bundle.concepts.has(linkConceptId)) {
        issues.push({
          severity: "warning",
          path: concept.conceptId,
          message: `Link to '${link}' does not resolve to a known concept (tolerated per OKF spec, flagged for visibility)`,
        });
      }
    }
  }

  for (const registered of registeredToolNames) {
    if (!seenToolNames.has(registered)) {
      issues.push({
        severity: "warning",
        path: "tools/",
        message: `Registered tool '${registered}' has no OKF documentation file`,
      });
    }
  }

  return issues;
}
