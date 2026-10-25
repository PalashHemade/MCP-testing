"""Deterministic, rule-based stand-in for GeminiPlannerClient.

Used automatically whenever GEMINI_API_KEY is not configured (see
app.planner.planner.get_planner_client), and always in unit/integration
tests so CI does not need network access or a paid Gemini quota.

This is intentionally a small keyword/pattern engine, NOT a general NLU
system - it covers the demo's example questions and the planner
evaluation set (see tests/evaluation), and declines (unsupported_reason /
clarification_required) rather than guessing outside that coverage.
"""
import re
from datetime import date

from app.planner.base import ToolCandidate
from app.planner.date_parsing import parse_relative_date_range
from app.planner.schemas import ExecutionPlan, ToolCall

TRIP_NUMBER_RE = re.compile(r"\bTRIP-\d+\b", re.IGNORECASE)

SECURITY_BYPASS_PHRASES = (
    "ignore tenant restrictions",
    "ignore authorization",
    "ignore your instructions",
    "bypass tenant",
    "show me all customers",
    "show all customers' invoices",
)

DOCUMENT_KEYWORDS = ("policy", "regulation", "port rule", "documentation required", "documents required")
FINANCIAL_KEYWORDS = ("profit", "cost", "expense", "billing", "invoice", "paid", "revenue", "outstanding")
EXPENSE_ONLY_KEYWORDS = ("fuel", "toll", "loading", "allowance", "maintenance expense", "expenses")
UNPAID_KEYWORDS = ("unpaid", "overdue", "outstanding balance", "partially paid")
CUSTOMER_KEYWORDS = ("customer",)
VEHICLE_KEYWORDS = ("vehicle", "truck")
DRIVER_KEYWORDS = ("driver",)
ROUTE_KEYWORDS = ("route", "profit per kilometre", "profit per km")


def _available(name: str, candidates: list[ToolCandidate]) -> bool:
    return any(c.name == name for c in candidates)


class FakeGeminiClient:
    async def create_plan(
        self, *, question: str, candidate_tools: list[ToolCandidate], today: date
    ) -> ExecutionPlan:
        lowered = question.lower()
        names = {c.name for c in candidate_tools}

        if any(phrase in lowered for phrase in SECURITY_BYPASS_PHRASES):
            return ExecutionPlan(
                intent="Refused: request attempts to bypass tenant authorization.",
                unsupported_reason=(
                    "This request asks to ignore tenant/authorization restrictions. "
                    "Tenant scope is enforced server-side and cannot be overridden by "
                    "a user request; no cross-tenant data can be disclosed."
                ),
            )

        start_date, end_date = parse_relative_date_range(question, today=today)
        filters: dict = {}
        if start_date and end_date:
            filters["start_date"] = start_date.isoformat()
            filters["end_date"] = end_date.isoformat()

        trip_match = TRIP_NUMBER_RE.search(question)
        wants_document = any(k in lowered for k in DOCUMENT_KEYWORDS)
        wants_financial = any(k in lowered for k in FINANCIAL_KEYWORDS)
        wants_expenses_only = any(k in lowered for k in EXPENSE_ONLY_KEYWORDS) and "profit" not in lowered

        steps: list[ToolCall] = []
        step_counter = 0

        def next_step_id() -> str:
            nonlocal step_counter
            step_counter += 1
            return f"step_{step_counter}"

        if trip_match and "list_trips" not in (wants_document,):
            trip_number = trip_match.group(0).upper()
            if wants_expenses_only and "get_trip_expenses" in names:
                steps.append(ToolCall(step_id=next_step_id(), tool_name="get_trip_expenses", arguments={"trip_number": trip_number}))
            elif wants_financial and "get_trip_financials" in names:
                steps.append(ToolCall(step_id=next_step_id(), tool_name="get_trip_financials", arguments={"trip_number": trip_number}))
            elif "get_trip_details" in names:
                steps.append(ToolCall(step_id=next_step_id(), tool_name="get_trip_details", arguments={"trip_number": trip_number}))

        if any(k in lowered for k in UNPAID_KEYWORDS) and "list_unpaid_invoices" in names:
            args = dict(filters)
            steps.append(ToolCall(step_id=next_step_id(), tool_name="list_unpaid_invoices", arguments=args))

        if any(k in lowered for k in CUSTOMER_KEYWORDS) and wants_financial and "get_customer_trip_summary" in names:
            steps.append(ToolCall(step_id=next_step_id(), tool_name="get_customer_trip_summary", arguments=dict(filters)))

        if any(k in lowered for k in VEHICLE_KEYWORDS) and "get_vehicle_utilization" in names:
            steps.append(ToolCall(step_id=next_step_id(), tool_name="get_vehicle_utilization", arguments=dict(filters)))

        if any(k in lowered for k in DRIVER_KEYWORDS) and "get_driver_trip_history" in names:
            name_match = re.search(r"driver\s+([A-Za-z][A-Za-z\s]{1,40})", question, re.IGNORECASE)
            driver_name = name_match.group(1).strip().rstrip(".?,") if name_match else None
            args = dict(filters)
            if driver_name:
                args["driver_name"] = driver_name
            if "driver_name" in args:
                steps.append(ToolCall(step_id=next_step_id(), tool_name="get_driver_trip_history", arguments=args))

        if not trip_match and any(k in lowered for k in ROUTE_KEYWORDS) and "compare_route_profitability" in names:
            steps.append(ToolCall(step_id=next_step_id(), tool_name="compare_route_profitability", arguments=dict(filters)))

        if (
            not trip_match
            and not steps
            and not wants_document
            and ("trip" in lowered or "transit" in lowered)
            and "list_trips" in names
        ):
            args = dict(filters)
            if "in transit" in lowered:
                args["trip_status"] = "in_transit"
            elif "completed" in lowered:
                args["trip_status"] = "completed"
            steps.append(ToolCall(step_id=next_step_id(), tool_name="list_trips", arguments=args))

        if wants_document and not steps and "most profitable" in lowered and "compare_route_profitability" in names:
            # Hybrid question (e.g. scenario G): operational data + document lookup.
            steps.append(ToolCall(step_id=next_step_id(), tool_name="compare_route_profitability", arguments=dict(filters)))

        if wants_document and "search_logistics_documents" in names:
            steps.append(
                ToolCall(step_id=next_step_id(), tool_name="search_logistics_documents", arguments={"query": question})
            )

        if not steps:
            return ExecutionPlan(
                intent="Could not confidently map this question to a registered tool.",
                unsupported_reason=(
                    "This deterministic fallback planner did not recognize a supported "
                    "intent in the question. A live Gemini planner may handle a broader "
                    "range of phrasing; configure GEMINI_API_KEY to enable it."
                ),
            )

        return ExecutionPlan(
            intent=question.strip()[:200],
            requested_deliverables=[s.tool_name for s in steps],
            filters=filters,
            selected_tools=steps,
            expected_outputs=[s.tool_name for s in steps],
        )
