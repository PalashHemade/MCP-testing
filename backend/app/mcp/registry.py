"""Single source of truth for the 10 registered MCP tools.

Every tool's metadata (for embedding-based discovery + plan validation),
Pydantic schemas, and implementation (`run`) are wired together here. The
planner may only ever select tool names present in TOOL_REGISTRY, and the
orchestrator executes the exact same `run()` coroutine that the FastMCP
server exposes - there is exactly one implementation of each tool's logic.
"""
from dataclasses import dataclass
from typing import Awaitable, Callable

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.mcp.tools import (
    compare_route_profitability,
    get_customer_trip_summary,
    get_driver_trip_history,
    get_trip_details,
    get_trip_expenses,
    get_trip_financials,
    get_vehicle_utilization,
    list_trips,
    list_unpaid_invoices,
    search_logistics_documents,
)
from app.schemas.tools import (
    CompareRouteProfitabilityInput,
    CompareRouteProfitabilityOutput,
    GetCustomerTripSummaryInput,
    GetCustomerTripSummaryOutput,
    GetDriverTripHistoryInput,
    GetDriverTripHistoryOutput,
    GetTripDetailsInput,
    GetTripDetailsOutput,
    GetTripExpensesInput,
    GetTripExpensesOutput,
    GetTripFinancialsInput,
    GetTripFinancialsOutput,
    GetVehicleUtilizationInput,
    GetVehicleUtilizationOutput,
    ListTripsInput,
    ListTripsOutput,
    ListUnpaidInvoicesInput,
    ListUnpaidInvoicesOutput,
    SearchLogisticsDocumentsInput,
    SearchLogisticsDocumentsOutput,
)


@dataclass(frozen=True)
class ToolSpec:
    name: str
    run: Callable[[AsyncSession, AuthenticatedUser, BaseModel], Awaitable[BaseModel]]
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    purpose: str
    description: str
    prerequisites: str
    dependencies: str
    limitations: str
    permissions: str
    result_semantics: str
    example_questions: list[str]
    # Which AuthenticatedUser.role values may invoke this tool at all - the
    # real gate is still row-level filtering (customer_id/tenant_id, plus
    # DB-level RLS) for the data a tool returns, but some tools expose
    # internal-ops aggregates (fleet utilization, driver history, route
    # comparisons across customers) that a customer-portal user should
    # never see a candidate for, let alone call. Checked in
    # app.retrieval.tool_retrieval (candidate filtering) and
    # app.planner.planner.Planner._validate (hard gate).
    allowed_roles: frozenset[str] = frozenset({"operator", "customer"})


TOOL_SPECS: list[ToolSpec] = [
    ToolSpec(
        name="list_trips",
        run=list_trips.run,
        input_model=ListTripsInput,
        output_model=ListTripsOutput,
        purpose="Find trips matching filters such as status, date range, customer, vehicle, driver, or route.",
        description=(
            "Lists trips for the caller's tenant, optionally filtered by start/end date, "
            "trip_status, customer_id, vehicle_id, driver_id, origin, and destination. "
            "Supports pagination via limit/offset. Use this when the user wants a list of "
            "trips matching some criteria (e.g. 'trips currently in transit', 'trips to "
            "Mumbai last month') rather than a single trip's details."
        ),
        prerequisites="None.",
        dependencies="None - can be called standalone.",
        limitations=(
            "Only returns up to `limit` (max 500) trips per call; check page_info.has_more "
            "before treating results as exhaustive."
        ),
        permissions="Read-only; tenant-scoped automatically from the authenticated caller.",
        result_semantics=(
            "completeness=complete only when page_info.has_more is false. A single-page "
            "result with has_more=true is PARTIAL, not an error."
        ),
        example_questions=[
            "Show all trips currently in transit.",
            "List trips from Delhi to Mumbai in March.",
        ],
    ),
    ToolSpec(
        name="get_trip_details",
        run=get_trip_details.run,
        input_model=GetTripDetailsInput,
        output_model=GetTripDetailsOutput,
        purpose="Retrieve the full operational record for exactly one trip.",
        description=(
            "Looks up one trip by trip_number or trip_id and returns its customer, vehicle, "
            "driver, LR number, route, dates, and status. Use this for 'show me TRIP-1001' "
            "style single-record lookups."
        ),
        prerequisites="A trip_number or trip_id, typically obtained from list_trips or the user's question.",
        dependencies="None standalone; often chained after list_trips when a trip_number must first be resolved.",
        limitations="Returns found=false uniformly for a nonexistent trip or one belonging to another tenant.",
        permissions="Read-only; tenant-scoped.",
        result_semantics="completeness is always 'complete' - this tool never paginates.",
        example_questions=["Show me the details of TRIP-1001.", "What is the LR number for TRIP-1002?"],
    ),
    ToolSpec(
        name="get_trip_financials",
        run=get_trip_financials.run,
        input_model=GetTripFinancialsInput,
        output_model=GetTripFinancialsOutput,
        purpose="Return a trip's billing, expenses, profit, and profit-per-km.",
        description=(
            "Given a trip_number or trip_id, returns all invoices for that trip, the gross "
            "billed amount, amount paid, outstanding balance, recorded expenses (with "
            "category breakdown), trip profit, and profit-per-km when distance is known. "
            "Use for any question about a trip's money: profit, cost, billing, payment status."
        ),
        prerequisites="A trip_number or trip_id.",
        dependencies="None standalone; may follow list_trips when multiple trips must be evaluated.",
        limitations=(
            "trip_profit is null when no invoice is recorded (not zero). profit_per_km is "
            "null when distance_km is missing or non-positive. Missing expense rows are "
            "flagged via has_expense_data=false, never silently treated as zero cost."
        ),
        permissions="Read-only; tenant-scoped.",
        result_semantics="Always 'complete' for a found trip - all its invoices/expenses are included, never paginated.",
        example_questions=[
            "What was the profit on TRIP-1001?",
            "What is the profit per kilometre for TRIP-1001?",
        ],
    ),
    ToolSpec(
        name="get_trip_expenses",
        run=get_trip_expenses.run,
        input_model=GetTripExpensesInput,
        output_model=GetTripExpensesOutput,
        purpose="Retrieve the itemized expense entries for one trip.",
        description=(
            "Given a trip_number or trip_id, and optional expense_category / date range "
            "filters, returns the matching expense entries, a per-category breakdown, and "
            "the total recorded expenses. Use when the user wants expense detail rather than "
            "the full financial summary from get_trip_financials."
        ),
        prerequisites="A trip_number or trip_id.",
        dependencies="None.",
        limitations="An empty result means no expenses are recorded, which is not proof the trip had zero actual cost.",
        permissions="Read-only; tenant-scoped.",
        result_semantics="Always 'complete' for a found trip.",
        example_questions=["Show fuel expenses for TRIP-1001.", "What toll costs were recorded for TRIP-1003?"],
    ),
    ToolSpec(
        name="get_customer_trip_summary",
        run=get_customer_trip_summary.run,
        input_model=GetCustomerTripSummaryInput,
        output_model=GetCustomerTripSummaryOutput,
        purpose="Summarize trip counts and financial performance per customer over a date range.",
        description=(
            "Aggregates trip counts (total/completed/in-transit/cancelled) and financials "
            "(gross billed, paid, outstanding, expenses, profit) per customer, optionally "
            "scoped to a single customer_id and/or date range. Use for 'which customer "
            "generated the most revenue' or 'summarize this customer's trips' questions."
        ),
        prerequisites="None; customer_id is optional (omit to compare all authorized customers).",
        dependencies="None.",
        limitations="Aggregates at most 500 trips per customer per call (demo-scale cap).",
        permissions="Read-only; tenant-scoped; customer_id (if given) must belong to caller's tenant.",
        result_semantics="completeness='complete' within the 500-trip-per-customer cap.",
        example_questions=[
            "Which customer generated the most billed revenue last month?",
            "Summarize all trips for customer Acme Traders this quarter.",
        ],
    ),
    ToolSpec(
        name="list_unpaid_invoices",
        run=list_unpaid_invoices.run,
        input_model=ListUnpaidInvoicesInput,
        output_model=ListUnpaidInvoicesOutput,
        purpose="Find invoices that are unpaid or partially paid (or match an explicit payment_status).",
        description=(
            "Lists invoices with payment_status in {unpaid, partially_paid} by default, or a "
            "single explicit payment_status if given, optionally filtered by invoice date "
            "range. Flags is_overdue=true only when due_date has passed AND a balance remains."
        ),
        prerequisites="None.",
        dependencies="None.",
        limitations="Pagination applies (max 500/page); check page_info.has_more.",
        permissions="Read-only; tenant-scoped.",
        result_semantics="completeness=complete only when has_more is false.",
        example_questions=["Show all unpaid and partially paid invoices.", "Which invoices are overdue?"],
    ),
    ToolSpec(
        name="get_vehicle_utilization",
        run=get_vehicle_utilization.run,
        input_model=GetVehicleUtilizationInput,
        output_model=GetVehicleUtilizationOutput,
        purpose="Summarize trip counts and recorded distance per vehicle over a period.",
        description=(
            "For each vehicle (or one vehicle_id), reports trip_count, completed/in-transit "
            "counts, and total recorded distance_km over an optional date range."
        ),
        prerequisites="None.",
        dependencies="None.",
        limitations=(
            "Does NOT compute a utilization percentage or availability-hours metric - the "
            "schema has no vehicle-availability data to support one."
        ),
        permissions="Read-only; tenant-scoped. Operator-only: an internal fleet metric, not a customer-facing one.",
        result_semantics="Always 'complete' - no pagination; every tenant vehicle (or the one requested) is included.",
        example_questions=[
            "Which vehicles completed the most trips this quarter?",
            "How is truck MH-12-AB-1234 being utilized this month?",
        ],
        allowed_roles=frozenset({"operator"}),
    ),
    ToolSpec(
        name="get_driver_trip_history",
        run=get_driver_trip_history.run,
        input_model=GetDriverTripHistoryInput,
        output_model=GetDriverTripHistoryOutput,
        purpose="Retrieve one driver's trip history, resolving by driver_id or (possibly ambiguous) driver_name.",
        description=(
            "Given a driver_id or driver_name, returns that driver's trips (with optional "
            "date range and pagination). If driver_name matches more than one driver, "
            "returns ambiguous=true with the candidate list instead of guessing."
        ),
        prerequisites="A driver_id or driver_name.",
        dependencies="None.",
        limitations="When ambiguous=true, no trips are returned - the caller/planner must disambiguate first.",
        permissions="Read-only; tenant-scoped. Operator-only: driver-level data, not a customer-facing one.",
        result_semantics="completeness='unknown' when ambiguous or driver not found; otherwise follows page_info.has_more.",
        example_questions=["Show the trip history for driver Ramesh.", "How many trips has driver DRV-004 completed?"],
        allowed_roles=frozenset({"operator"}),
    ),
    ToolSpec(
        name="compare_route_profitability",
        run=compare_route_profitability.run,
        input_model=CompareRouteProfitabilityInput,
        output_model=CompareRouteProfitabilityOutput,
        purpose="Compare directional routes (origin->destination) by aggregate profit and profit-per-km.",
        description=(
            "Groups trips by directional route (origin, destination) within an optional date "
            "range, and reports trip_count, gross billed, expenses, aggregate profit, total "
            "distance, and aggregate_profit_per_km = sum(profit)/sum(distance) for the group "
            "(not an average of per-trip ratios). min_sample_size flags (but does not silently "
            "drop) route groups with too few trips to be statistically meaningful."
        ),
        prerequisites="None.",
        dependencies="None.",
        limitations="Aggregates at most 500 trips total per call (demo-scale cap). Routes are directional.",
        permissions="Read-only; tenant-scoped. Operator-only: compares performance across all customers' trips.",
        result_semantics="Always 'complete' within the 500-trip cap; excluded_below_min_sample marks thin samples.",
        example_questions=["Which route had the highest profit per kilometre this month?"],
        allowed_roles=frozenset({"operator"}),
    ),
    ToolSpec(
        name="search_logistics_documents",
        run=search_logistics_documents.run,
        input_model=SearchLogisticsDocumentsInput,
        output_model=SearchLogisticsDocumentsOutput,
        purpose="Retrieve relevant passages from policy/port-regulation documents via RAG.",
        description=(
            "Searches logistics_documents (tenant-private + global demo content) for passages "
            "relevant to a natural-language query, optionally filtered by document_type, "
            "jurisdiction, and effective_date. Uses pgvector cosine-similarity search over "
            "Gemini embeddings when available, and falls back to deterministic keyword "
            "overlap (retrieval_method='keyword_fallback') when the embedding service is "
            "unavailable - never fabricates a result or a citation."
        ),
        prerequisites="None.",
        dependencies="None.",
        limitations=(
            "found_relevant_results=false means no sufficiently relevant passage was found; "
            "the caller must not invent an answer in that case. All current content is "
            "fictional demo policy/regulation text, flagged via is_demo_content=true."
        ),
        permissions="Read-only; tenant-private documents are isolated from other tenants; global documents are shared.",
        result_semantics="completeness='unknown' when no passages are found (absence of evidence, not evidence of completeness).",
        example_questions=[
            "According to the applicable port policy, what documents are required for this shipment?",
        ],
    ),
]

TOOL_REGISTRY: dict[str, ToolSpec] = {spec.name: spec for spec in TOOL_SPECS}


def get_tool_spec(name: str) -> ToolSpec | None:
    return TOOL_REGISTRY.get(name)
