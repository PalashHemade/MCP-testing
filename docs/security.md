# Security model

## Authentication (demo vs. real)

`AUTH_MODE=dev` (the only implemented mode) resolves identity from an
`X-Demo-User` header against a small fixed set of server-side demo users in
`app.auth.dev_auth.DEV_USERS` - there is no password or token, anyone who can
reach the API can claim any listed demo identity. This is loudly documented as
development-only in that module's docstring, and `app.auth.dependencies`
refuses to start with `AUTH_MODE=dev` when `APP_ENV=production`.

`AUTH_MODE=oidc` is an explicit, documented stub: it returns `501 Not
Implemented` rather than fabricating a successful login. A real deployment
must replace `app.auth.dependencies.get_current_user` with real OIDC/JWT
verification before going anywhere near production traffic.

## Two authorization axes: tenant, and (optionally) customer

`AuthenticatedUser` (`app/auth/models.py`) carries:

- `tenant_id` - always required. Which logistics company's data this is.
- `role` - `"operator"` (internal staff of that logistics company; sees
  every customer within the tenant) or `"customer"` (an external
  customer-portal login; sees only their own trips/invoices/expenses).
- `customer_id` - required when `role == "customer"`, `None` for operators.

Both are **server-derived only, never client-supplied**:

- No API endpoint, tool input schema, or planner output field accepts a
  `tenant_id` argument at all.
- A tool input schema that does carry a `customer_id` field (e.g.
  `list_trips`, `get_customer_trip_summary`) is a legitimate *filter* for an
  operator, but for a "customer" role it is always overridden by
  `AuthenticatedUser.effective_customer_filter()`, which returns
  `self.customer_id` unconditionally regardless of what was requested - the
  same "never trust a client/LLM-supplied scope" rule applied one level
  down. See `tests/integration/test_customer_scoping.py::test_list_trips_customer_cannot_override_scope_via_argument`
  for the adversarial-plan case this stops.
- The planner's system prompt tells Gemini tenant scope is enforced
  server-side and cannot be changed by the user's question, and the
  deterministic `FakeGeminiClient` refuses outright on phrases like "ignore
  tenant restrictions" (`SECURITY_BYPASS_PHRASES`).
- `tests/integration/test_tenant_isolation.py` proves tenant isolation holds
  even with a **valid** id belonging to another tenant; `test_customer_scoping.py`
  proves the same for customer isolation within one tenant.

## Role-based tool access (RBAC)

Some tools expose internal fleet/ops aggregates a customer-portal user
should never see at all, regardless of row filtering:
`get_vehicle_utilization`, `get_driver_trip_history`, and
`compare_route_profitability` are `allowed_roles={"operator"}` in
`app.mcp.registry.TOOL_SPECS` (every other tool allows both roles). This is
checked twice: candidate retrieval (`ToolRetrievalService.get_candidates`)
never offers these to a "customer" role, and `Planner._validate` hard-rejects
a plan that selects one anyway, independent of what was retrieved. The
`/api/v1/tools` listing endpoints also filter by role, so a customer-role
caller cannot even see these tools exist via the API.

## Row-Level Security

Implemented for real, on `trips`, `trip_billing`, and `trip_expenses` - not
just documented as a possible future step. The design:

- **`app_runtime`** (created by migration `0002_customer_row_level_security.py`)
  is the role the *running app* connects as (`DATABASE_URL`). It owns
  nothing and is not a superuser - both would otherwise make Postgres
  silently bypass RLS regardless of any policy (`ALTER TABLE ... FORCE ROW
  LEVEL SECURITY` only overrides the *owner* bypass, never the superuser
  one). It has `SELECT`-only grants - it cannot write anything, which is
  correct since every tool is read-only.
- **`logistics`** (the original role) is the table owner, used only by
  migrations/seeding/admin scripts (`ADMIN_DATABASE_URL`, see
  `app/db/admin_session.py`) - it must bypass RLS to see/write every row
  regardless of scope. Request-handling code never imports this module.
- **Session variables** `app.current_tenant_id` / `app.current_customer_id`
  are set once per request by `app.auth.dependencies.get_scoped_db` (via
  `SELECT set_config(...)`), using `AuthenticatedUser.tenant_id`/`customer_id`
  - the same server-derived values as everywhere else, never a header or
    body field.
- **The policy** (`USING` clause) requires `tenant_id` to match, AND (for
  `trip_billing`/`trip_expenses`, which have no `customer_id` column of
  their own) that the row's owning trip's `customer_id` matches - unless
  `app.current_customer_id` is the empty-string sentinel, meaning "operator,
  no customer restriction." **If the session variable is never set at all,
  every row is hidden** (`current_setting(..., true)` returns `NULL`, and
  `tenant_id = NULL` is never true) - RLS here fails closed, not open.
- `app.utils` note: the empty-string sentinel is decoded with
  `NULLIF(..., '')::uuid`, not a bare cast guarded only by `OR`
  short-circuiting - Postgres does **not** guarantee that the right-hand
  side of `OR` is skipped just because the left-hand side is true (see the
  comment in the migration), so a naive version of this policy intermittently
  crashed with `invalid input syntax for type uuid: ""` until this was fixed.

`tests/integration/test_row_level_security.py` proves this is real
enforcement, not just documentation: it connects as the actual `app_runtime`
role and runs queries with **no tenant/customer `WHERE` clause in the SQL at
all** (e.g. bare `SELECT trip_number FROM trips`), and confirms the database
itself still only returns the scoped rows - including a test that an
app-level bug which "forgot" to filter would still be caught, and a test
that the role cannot write at all (`SELECT`-only grant).

Application code (repositories/services) still filters by
`tenant_id`/`customer_id` itself too - RLS is the last line of defense here,
proven independently, not a replacement for correct queries at the layer
above it.

## MCP server auth (documented simplification)

The standalone MCP server (`app.mcp.server`) binds to **one fixed demo
identity** (`DEMO_MCP_USER_KEY` env var) rather than authenticating each MCP
connection individually - see the module docstring for why, and treat the
FastAPI chat path as the authoritative, per-request-authenticated access path.
Do not expose this server to the public internet.

## What never happens

- The LLM never gets a database connection or the ability to run arbitrary
  SQL or code - it can only emit a structured `ExecutionPlan` naming
  registered tools, which is independently schema-validated before
  execution (`Planner._validate`).
- Document/tool-result text is treated as data, never instructions - the
  planner and answer-generation system prompts both say so explicitly, and
  nothing in the orchestrator re-feeds a tool's raw text back as a prompt
  without that framing.
- Raw exceptions, stack traces, and connection strings are never returned to
  the client (`app.main.unhandled_exception_handler` logs them server-side
  with a request id and returns a generic message).
- Secrets (`GEMINI_API_KEY`, database credentials) are never sent to the
  frontend; the frontend only ever talks to the FastAPI API.
