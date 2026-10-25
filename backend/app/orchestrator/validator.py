"""Deterministic post-execution validation. Ordinary backend code - no
LLM call here. Flags issues the final-answer step must disclose rather
than silently paper over.
"""
from dataclasses import dataclass, field

from app.orchestrator.executor import ExecutionTrace


@dataclass
class ValidationReport:
    has_errors: bool = False
    is_partial: bool = False
    is_unknown_completeness: bool = False
    issues: list[str] = field(default_factory=list)

    @property
    def fully_complete(self) -> bool:
        return not self.has_errors and not self.is_partial and not self.is_unknown_completeness


def validate_trace(trace: ExecutionTrace) -> ValidationReport:
    report = ValidationReport()

    for step in trace.steps:
        if step.status == "error":
            report.has_errors = True
            report.issues.append(f"Step '{step.step_id}' ({step.tool_name}) failed: {step.error}")
            continue

        output = step.output or {}
        completeness = output.get("completeness")
        if completeness == "partial":
            report.is_partial = True
            page_info = output.get("page_info") or {}
            report.issues.append(
                f"Step '{step.step_id}' ({step.tool_name}) returned a partial result "
                f"(returned {page_info.get('returned_count')} of "
                f"{page_info.get('total_count')} matching records)."
            )
        elif completeness == "unknown":
            report.is_unknown_completeness = True
            report.issues.append(
                f"Step '{step.step_id}' ({step.tool_name}) has unknown completeness "
                "(e.g. an ambiguous lookup or no relevant documents found)."
            )

        if output.get("found") is False:
            report.issues.append(f"Step '{step.step_id}' ({step.tool_name}) found no matching record.")

        if output.get("ambiguous") is True:
            report.issues.append(
                f"Step '{step.step_id}' ({step.tool_name}) matched multiple records ambiguously; "
                "needs disambiguation."
            )

    return report
