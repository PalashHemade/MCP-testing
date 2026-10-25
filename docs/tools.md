# MCP Tools

All 10 tools are read-only, tenant-scoped automatically from the authenticated
caller (never from a client-supplied `tenant_id`), and use parameterized
database access only - no tool accepts or executes arbitrary SQL. Defined once
in `backend/app/mcp/registry.py`; implemented in `backend/app/mcp/tools/*.py`,
delegating to `backend/app/services/*.py` so there is a single implementation
behind both the FastAPI orchestrator and the standalone MCP server.

Every tool's full description, input/output JSON schema, prerequisites,
dependencies, limitations, permissions, and example questions are also
served live at `GET /api/v1/tools` and `GET /api/v1/tools/{tool_name}`.

| Tool | Purpose | Roles | Key limitation |
|---|---|---|---|
| `list_trips` | Find trips by status/date/customer/vehicle/driver/route | operator, customer | Paginated (max 500/page); `completeness` is `partial` when more pages remain. For a "customer" caller, always scoped to their own `customer_id` regardless of the `customer_id` argument |
| `get_trip_details` | Full operational record for one trip | operator, customer | Not-found is reported identically for a nonexistent trip, another tenant's trip, or (for a "customer" caller) another customer's trip |
| `get_trip_financials` | Billing, expenses, profit, profit/km for one trip | operator, customer | `trip_profit` is `null` (not `0`) with no invoice; `profit_per_km` is `null` without positive distance |
| `get_trip_expenses` | Itemized expenses for one trip, with category breakdown | operator, customer | An empty result is not proof of zero actual cost |
| `get_customer_trip_summary` | Per-customer trip counts + financials over a date range | operator, customer | Aggregates at most 500 trips per customer per call; a "customer" caller always gets only their own summary |
| `list_unpaid_invoices` | Invoices that are unpaid/partially paid (or an explicit status) | operator, customer | Default scope excludes `draft`/`cancelled`; paginated; customer-scoped for a "customer" caller |
| `get_vehicle_utilization` | Trip counts + recorded distance per vehicle | **operator only** | Never reports a utilization percentage - the schema has no availability-hours data |
| `get_driver_trip_history` | One driver's trip history, by id or (possibly ambiguous) name | **operator only** | Ambiguous name match returns `ambiguous=true` + candidates, never a guess |
| `compare_route_profitability` | Directional route comparison by aggregate profit/km | **operator only** | `aggregate_profit_per_km = sum(profit)/sum(distance)`, not an average of per-trip ratios; aggregates at most 500 trips/call |
| `search_logistics_documents` | RAG search over policy/port-regulation documents | operator, customer | Falls back to deterministic keyword search (and says so via `retrieval_method`) when embeddings are unavailable; never fabricates a citation |

The three operator-only tools expose internal fleet/ops aggregates across
customers, which a customer-portal login should never see as a candidate,
let alone call - see `app.mcp.registry.ToolSpec.allowed_roles` and
[security.md](security.md) "Role-based tool access (RBAC)."

## Tool metadata and embedding-based discovery

`app.mcp.registry.TOOL_SPECS` is the single source of truth for every tool's
metadata. `python -m app.scripts.seed_demo` writes it into the `tool_metadata`
table (description, schemas, limitations, etc. - everything except the
embedding vector). `python -m app.scripts.rebuild_embeddings` backfills the
`embedding` column for both `tool_metadata` and `document_chunks` using
Gemini's embedding model - it is a no-op (not an error) when `GEMINI_API_KEY`
is unset, printing a clear message instead of pretending to succeed.

At request time, `app.retrieval.tool_retrieval.ToolRetrievalService` returns
candidate tools to the planner via pgvector cosine similarity when embeddings
exist, supplemented with a deterministic keyword ranking (never vector
similarity alone - see its module docstring), or keyword ranking alone when
embeddings are unavailable. The planner may only select from the tools it was
actually offered as candidates, and every selection is independently
schema-validated against `TOOL_REGISTRY` before execution
(`app.planner.planner.Planner._validate`) - retrieval narrows the options, it
never grants capability by itself.
