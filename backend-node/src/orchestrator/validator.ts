/** Deterministic post-execution validation - ordinary backend code, no
 * LLM call. Mirrors app.orchestrator.validator in the Python sibling
 * backend. Flags issues the final-answer step must disclose rather than
 * silently paper over.
 */
import type { ExecutionTrace } from "./executor.js";

export interface ValidationReport {
  hasErrors: boolean;
  isPartial: boolean;
  isUnknownCompleteness: boolean;
  issues: string[];
}

export function validateTrace(trace: ExecutionTrace): ValidationReport {
  const report: ValidationReport = { hasErrors: false, isPartial: false, isUnknownCompleteness: false, issues: [] };

  for (const step of trace.steps) {
    if (step.status === "error") {
      report.hasErrors = true;
      report.issues.push(`Step '${step.stepId}' (${step.toolName}) failed: ${step.error}`);
      continue;
    }

    const output = step.output ?? {};
    const completeness = output.completeness;
    if (completeness === "partial") {
      report.isPartial = true;
      const pageInfo = (output.pageInfo as Record<string, unknown>) ?? {};
      report.issues.push(
        `Step '${step.stepId}' (${step.toolName}) returned a partial result ` +
          `(returned ${pageInfo.returnedCount} of ${pageInfo.totalCount} matching records).`,
      );
    } else if (completeness === "unknown") {
      report.isUnknownCompleteness = true;
      report.issues.push(
        `Step '${step.stepId}' (${step.toolName}) has unknown completeness (e.g. an ambiguous ` +
          "lookup or no relevant documents found).",
      );
    }

    if (output.found === false) {
      report.issues.push(`Step '${step.stepId}' (${step.toolName}) found no matching record.`);
    }
    if (output.ambiguous === true) {
      report.issues.push(
        `Step '${step.stepId}' (${step.toolName}) matched multiple records ambiguously; needs disambiguation.`,
      );
    }
  }

  return report;
}

export function isFullyComplete(report: ValidationReport): boolean {
  return !report.hasErrors && !report.isPartial && !report.isUnknownCompleteness;
}
