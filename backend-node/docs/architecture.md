# Architecture

Node.js/Express/TypeScript backend for the logistics AI chatbot - the only
backend in this project. It started as a rewrite of an earlier Python/
FastAPI implementation, built to the exact same 10 tools, tenant/customer
isolation, and financial definitions; that Python backend has since been
fully decommissioned and removed, and this one is now the sole source of
truth for everything. It differs from that earlier implementation in two
deliberate ways, preserved here because they still explain real design
decisions: the Node/TS toolchain throughout (no Python in the request
path), and the Open Knowledge Format (OKF) for tool/metric/document
descriptions instead of pgvector/embeddings-based retrieval - see
[okf.md](okf.md). See [migration-from-fastapi.md](migration-from-fastapi.md)
for the full history of that migration and decommissioning.

## Request flow

```
React frontend (../frontend)
        |  HTTP, X-Demo-User header (dev auth)
        v
Express app (src/app.ts)
        |  requireUser -> withScopedClient (RLS session vars set)
        v
runChatPipeline (src/orchestrator/pipeline.ts)
        |
        1. getCandidateTools(role)        -- src/orchestrator/toolDiscovery.ts
        |     every tool the role may use, every time (no ranking/embeddings)
        2. Planner.buildPlan(...)         -- src/planner/planner.ts
        |     Gemini (or FakePlannerClient offline) proposes an ExecutionPlan;
        |     validate() re-checks tool existence, role, candidate membership,
        |     argument schema, step-id/dependency integrity - the model's
        |     output is never trusted on its own
        3. executePlan(plan, ...)         -- src/orchestrator/executor.ts
        |     runs independent steps concurrently, dependent steps in layers,
        |     each with a bounded timeout + one bounded retry
        4. validateTrace(trace)           -- src/orchestrator/validator.ts
        |     flags partial/ambiguous/error results for the answer step
        5. generateAnswer(...)            -- src/orchestrator/answer.ts
        |     Gemini (or an offline fallback) writes the final answer,
        |     strictly grounded in the tool JSON + OKF metric definitions
        v
ChatResponse (camelCase internally, snake_case on the wire - see below)
```

The LLM never gets a database connection and never sees raw SQL. Every tool
call it can request is schema-validated against the single tool registry
(`src/mcp/registry.ts`) before it runs, and tenant/customer scoping is
enforced independently in Postgres (RLS), not just in application code - see
[security.md](security.md).

## Two ways to reach the same tools

The 10 tools have exactly one implementation each (`src/mcp/tools/*.ts`,
registered in `src/mcp/registry.ts`). Two different front doors call into
that same registry:

- **Express API** (`src/app.ts`) - what the chat pipeline and the React
  frontend use. Per-request identity via dev auth, per-request RLS scoping.
- **Standalone MCP server** (`src/mcp/server.ts`) - the official
  `@modelcontextprotocol/sdk`, Streamable HTTP transport, for any MCP-aware
  client (e.g. Claude Desktop, an MCP inspector) to call these tools
  directly. It's bound to one fixed demo identity for the whole process
  (`DEMO_MCP_USER_KEY`, default `demo-ops-primary`) - a deliberate
  simplification, not a protocol limitation; see [tools.md](tools.md) and
  [security.md](security.md) for why.

## Layering

```
src/api/            Express app, routes, middleware (HTTP boundary)
src/orchestrator/    pipeline / tool discovery / executor / validator / answer
src/planner/          Gemini + offline fallback planner, Zod<->Gemini schema bridge
src/mcp/              tool registry + 10 tool wrappers + standalone MCP server
src/services/         business logic (financials, trips, customers, vehicles, ...)
src/repositories/     raw parameterized `pg` queries - the only SQL in the app
src/knowledge/        OKF bundle loader/resolver (src/knowledge/types.ts etc.)
src/db/               pool(s), RLS session scoping, deterministic seed ids, pg type fixes
src/auth/             dev auth (X-Demo-User), role/customer-filter model
src/schemas/          Zod schemas - the single source of truth for every shape on the wire
src/scripts/          seed / reset / schema-check / OKF-validate CLIs
```

Each tool wrapper in `src/mcp/tools/` is intentionally thin: it exists only
to satisfy `ToolSpec.run`'s signature and to present the per-tool Zod schema
to the registry. All real logic lives in `src/services/*.ts`, which is the
layer both the Express path and the standalone MCP server call into
identically.

## Wire-format compatibility with the existing frontend

Internal TypeScript code is idiomatic camelCase throughout. The React
frontend (`../frontend`) was built against the Python/FastAPI backend's
Pydantic-default snake_case JSON, and is reused here unchanged. The bridge is
a single recursive transform, applied only at the HTTP response boundary:

- `src/api/caseTransform.ts` - `toSnakeCase(value)` walks arrays/objects and
  rewrites every key. Used in `chat.ts` (`res.json(toSnakeCase(response))`)
  and in `tools.ts`'s `/execute` endpoint.
- `tools.ts`'s `GET` endpoints (list/get tool metadata) build their
  snake_case objects by hand instead, because `ToolMetadata.inputSchema`'s
  *value* is an opaque JSON Schema object whose own keywords
  (`minLength`, `additionalProperties`, ...) must never be rewritten by a
  blind camelCase->snake_case pass.

This was verified end-to-end by booting the server and diffing a live
response against the frontend's TypeScript interfaces in
`../frontend/src/types/api.ts` - every field at every nesting level matches,
including the `due_date` string format (see "pg type gotchas" below).

## Notable implementation details / gotchas

- **`pg` DATE columns**: `pg` auto-parses SQL `DATE` into a JS `Date` at
  local-midnight, which re-serializes as a UTC timestamp and silently
  shifts by a day in most timezones. Fixed once, globally, in
  `src/db/pgTypes.ts` by overriding the type parser for OID 1082 to return
  the raw `"YYYY-MM-DD"` string `pg` received from Postgres.
- **Gemini Developer API schema restrictions**: `z.toJSONSchema()` (Zod v4)
  emits `additionalProperties: false`, `$schema`, and `default`, all of
  which the Gemini Developer API's `responseSchema` rejects (Vertex AI
  tolerates `additionalProperties`; the Developer API doesn't). Stripped
  recursively in `src/planner/schemaToGemini.ts`.
- **Dict-shaped tool arguments**: Gemini's structured output can't express
  an open `Record<string, unknown>` field directly. The planner's
  Gemini-facing schema (`GeminiExecutionPlanSchema`) encodes `arguments`/
  `filters` as JSON-string fields (`argumentsJson`/`filtersJson`); the real,
  decoded `ExecutionPlanSchema` is what the rest of the app (validator,
  executor) actually works with - see `src/planner/schemas.ts`'s
  `toExecutionPlan()`.
- **Unbounded `google-genai` timeouts**: `HttpOptions.timeout` is unset by
  default in both the Python and TypeScript `google-genai` SDKs, so a
  Google-side "high demand" incident that queues rather than fails requests
  can hang a call indefinitely. Bounded explicitly to 20s in both
  `src/planner/geminiClient.ts` and `src/orchestrator/answer.ts`, paired
  with one bounded retry on a 429/5xx (`src/utils/geminiRetry.ts`) - see
  [security.md](security.md) "Timeouts and graceful degradation" for the
  full behavior under failure.
