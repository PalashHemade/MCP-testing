# Security

## Authentication (development only)

`AUTH_MODE=dev` (the only implemented mode) resolves identity from an
`X-Demo-User` header against a small, fixed, server-side list in
`src/auth/devAuth.ts` - no password, token, or session; anyone who can
reach the API can claim any listed identity. `requireUser`
(`src/auth/dependencies.ts`) **refuses to start serving `dev` auth if
`APP_ENV=production`** (500, not a silent fallback), and `AUTH_MODE=oidc`
is a documented, unimplemented stub (501) rather than a half-built real
auth path - replace `src/auth/dependencies.ts` with a real OIDC/JWT
verifier before this goes anywhere near production traffic.

| Demo identity | Role | Tenant | Customer |
|---|---|---|---|
| `demo-ops-primary` | operator | Primary Logistics Co | - (sees all customers) |
| `demo-ops-secondary` | operator | Secondary Freight Co | - |
| `demo-customer-acme` | customer | Primary Logistics Co | Acme Traders |
| `demo-customer-bharat` | customer | Primary Logistics Co | Bharat Textiles |
| `demo-customer-oceanic` | customer | Primary Logistics Co | Oceanic Imports |

The React frontend's login selector (`frontend/src/types/api.ts`
`DEMO_USERS`) intentionally lists **only the three customer identities**.
Operator/admin access is a separate, internal/platform concern with its own
RBAC, provisioned directly in the database - the chatbot's own frontend has
no entry point to it at all, by design, not just by omission. It remains
fully usable via the API directly (`X-Demo-User: demo-ops-primary` header)
or the standalone MCP server, for backend testing.

## Authorization: three independent gates, not one

A `customer`-role session is prevented from ever seeing another customer's
(or another tenant's) data in three places that don't rely on each other:

1. **`effectiveCustomerFilter`** (`src/auth/models.ts`) - for a `customer`
   role, every service call uses `user.customerId`, full stop; any
   `customerId` argument the planner or a direct API caller supplied is
   ignored outright for that role. An operator's `requested` filter passes
   through unchanged (undefined = "every customer in the tenant").
2. **Tool registry role gating** (`src/mcp/registry.ts`
   `allowedRoles`) - `get_vehicle_utilization`, `get_driver_trip_history`,
   and `compare_route_profitability` are `operator`-only. Checked in
   `getCandidateTools` (never offered to a customer role as a candidate in
   the first place) and again, independently, in `Planner.validate` (a
   hard gate even if a plan somehow named the tool anyway) and in
   `tools.ts`'s direct-execute endpoint (same tool name -> 404 whether it
   doesn't exist or this role can't see it, so a customer can't even probe
   for its existence).
3. **Postgres Row-Level Security** - the actual, final backstop,
   independent of anything the application code does or forgets to do.

### Row-Level Security

`migrations/1700000000001_customer-row-level-security.ts` creates a
restricted role, `app_runtime_node` - **not** the table owner, **not** a
superuser, `SELECT`-only on exactly the 8 tables it needs - because RLS
policies are bypassed entirely for a table's owner and for superusers
regardless of `FORCE ROW LEVEL SECURITY`. The running app and the
standalone MCP server connect exclusively as this role (`DATABASE_URL`);
migrations/seed/admin scripts connect as `logistics`, the owning role
(`ADMIN_DATABASE_URL`), and intentionally bypass RLS to do their job.

Each request sets two session-local Postgres GUCs before running any
query (`src/api/middleware/scopedClient.ts`, `withScopedClient`):

```sql
SELECT set_config('app.current_tenant_id', $1, false);
SELECT set_config('app.current_customer_id', $2, false);  -- '' for an operator
```

and the policy on `trips` (billing/expenses mirror it via a `trip_id`
subquery, since they don't carry their own `customer_id`):

```sql
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_customer_isolation ON trips USING (
  tenant_id = current_setting('app.current_tenant_id', true)::uuid
  AND (
    coalesce(current_setting('app.current_customer_id', true), '') = ''
    OR customer_id = nullif(current_setting('app.current_customer_id', true), '')::uuid
  )
);
```

Two things worth knowing if you touch this policy:

- **Postgres does not guarantee OR short-circuit evaluation.** The empty-
  string "operator" sentinel is cast via `nullif(x, '')::uuid`, not via
  relying on the left side of the `OR` being checked first - a bare
  `current_setting(...)::uuid` on an empty string raises immediately
  regardless of which side of an `OR` it's written on.
- `tests/security/rowLevelSecurity.test.ts` proves this with **raw SQL
  and no `WHERE` clause at all**, against the real restricted role - it
  connects as `app_runtime_node`, sets the session GUCs, runs
  `SELECT * FROM trips`, and asserts the row set already matches the
  policy, specifically so this isn't just "the application remembered to
  filter."

## Timeouts and graceful degradation

Everything that talks to an external, potentially slow/unavailable
service - Gemini, or Postgres itself - is bounded, retried once if the
failure looks transient, and degrades to a specific, correctly-coded HTTP
status with a short, safe message. The raw exception (which can include
stack traces, connection strings, or provider-internal text) is always
logged server-side only, tagged with the request id, and never relayed to
the client:

| Failure | Where it's caught | What the client sees |
|---|---|---|
| Gemini planning call times out / 429 / 5xx | `pipeline.ts` catches around `Planner.buildPlan` | 200, with `unsupported_reason` set to a short cause ("...because the AI service is temporarily unavailable (high demand)...") - never a bare 500, the request still completes |
| Gemini final-answer call fails after planning/execution already succeeded | `answer.ts` | 200, with the already-fetched tool data rendered via the offline fallback formatter plus a one-line note - the user still gets the real numbers even if the prose summary couldn't be generated |
| One tool step throws (DB error, an unresolved `$result` reference, etc.) | `executor.ts` `runStep` | That step's `tool_executions[].error` is a short, generic, retry-oriented message (`describeStepFailure`) instead of the raw driver/exception text; a Zod validation failure is the one exception kept verbatim, since it's actionable caller-input feedback, not an internal leak |
| One tool step exceeds 15s | `executor.ts` `withTimeout` | Same as above - timed-out steps are retried once, then reported as a step error, never left hanging |
| Can't check out a DB connection at all (Postgres down/unreachable) | `scopedClient.ts` | **503**, "The database is temporarily unavailable. Please try again shortly." |
| `/api/v1/health/ready` can't reach Postgres | `health.ts` | **503** (not 200 - a readiness probe that always returns 200 can't actually signal "stop routing traffic here" to infra) |
| Any other unhandled exception reaching Express | `app.ts` global error handler | **503** for a recognized transient connection error code (`ECONNREFUSED`/`ETIMEDOUT`/`EHOSTUNREACH`/Postgres `57P03`), **500** with a generic message otherwise - both tagged with `requestId` so the matching server log line can be found |

Gemini call sites (`geminiClient.ts`, `answer.ts`) explicitly bound
`HttpOptions.timeout` to 20s - both the Python and TypeScript
`google-genai` SDKs leave this **unset (unbounded)** by default, which
during a real Google-side "high demand" incident lets a queued request
hang indefinitely rather than fail fast. `src/utils/geminiRetry.ts` retries
only 429/500/502/503/504 once, with backoff - a 400/404 fails immediately,
since retrying a permanently-invalid request just burns quota.

On the frontend, `frontend/src/api/client.ts` adds its own 60s
`AbortController` timeout as a last-resort safety net against a lower-level
hang the backend's own bounds can't catch (a dropped connection, a stuck
process) - not to preempt a legitimately slow-but-bounded backend response.
`ApiError.retryable` distinguishes "this is probably transient, show a
Retry button" (timeouts, network failure, 429, 5xx) from "retrying the
identical request will just fail the same way" (4xx) - see
[architecture.md](architecture.md) and `ChatPage.tsx`.

## Other hardening notes

- `POST /api/v1/tools/:toolName/execute` (direct tool execution, used for
  manual testing) is disabled outright when `APP_ENV=production` (403) -
  it exists for development/debugging, not as a production surface.
- CORS is restricted to `FRONTEND_ORIGIN` (one configured origin, with
  credentials), not a wildcard.
- The request body size limit is 256kb (`express.json({ limit: "256kb" })`).
- The standalone MCP server (`src/mcp/server.ts`) is bound to a single
  fixed demo identity for its whole process lifetime
  (`DEMO_MCP_USER_KEY`), not a per-connection identity - a deliberate,
  documented simplification for this demo's stdio/HTTP MCP surface, not a
  claim that it enforces the same per-caller isolation the Express API
  does. Treat it as a single-tenant debugging tool, not a multi-tenant
  endpoint.
