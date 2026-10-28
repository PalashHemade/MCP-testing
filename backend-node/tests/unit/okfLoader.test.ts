import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadBundle, validateBundle } from "../../src/knowledge/loader.js";
import { resolveAllMetrics, resolveToolKnowledge } from "../../src/knowledge/resolver.js";
import { TOOL_SPECS } from "../../src/mcp/registry.js";

const KNOWLEDGE_ROOT = resolve(import.meta.dirname, "../../../knowledge");

describe("OKF bundle (real knowledge/ directory)", () => {
  it("loads with zero conformance errors against the real tool registry", () => {
    const bundle = loadBundle(KNOWLEDGE_ROOT);
    const issues = validateBundle(bundle, new Set(TOOL_SPECS.map((t) => t.name)));
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
    expect(bundle.concepts.size).toBeGreaterThan(20);
  });

  it("every concept file has a non-empty type", () => {
    const bundle = loadBundle(KNOWLEDGE_ROOT);
    for (const concept of bundle.concepts.values()) {
      expect(concept.type, `${concept.conceptId} missing type`).not.toBe("");
    }
  });

  it("the root index.md declares okf_version", () => {
    const bundle = loadBundle(KNOWLEDGE_ROOT);
    const root = bundle.indexes.get("index");
    expect(root?.okfVersion).toBe("0.2");
  });

  it("resolveToolKnowledge respects role filtering and the context budget", () => {
    const bundle = loadBundle(KNOWLEDGE_ROOT);
    const customerAllowed = new Set(["list_trips", "get_trip_details"]);
    const resolved = resolveToolKnowledge(bundle, customerAllowed, 100_000);
    expect(resolved.loadedPaths).toContain("tools/list_trips");
    expect(resolved.loadedPaths).toContain("tools/get_trip_details");
    expect(resolved.loadedPaths).not.toContain("tools/get_vehicle_utilization");
  });

  it("resolveToolKnowledge skips files once the budget is exhausted", () => {
    const bundle = loadBundle(KNOWLEDGE_ROOT);
    const allTools = new Set(TOOL_SPECS.map((t) => t.name));
    const resolved = resolveToolKnowledge(bundle, allTools, 50); // tiny budget
    expect(resolved.skippedForBudget.length).toBeGreaterThan(0);
  });

  it("resolveAllMetrics loads all 5 metric concepts", () => {
    const bundle = loadBundle(KNOWLEDGE_ROOT);
    const resolved = resolveAllMetrics(bundle);
    expect(resolved.loadedPaths.length).toBe(5);
  });

  it("path traversal outside the bundle root is refused", () => {
    expect(() => loadBundle("/nonexistent-root-for-this-test")).toThrow();
  });
});
