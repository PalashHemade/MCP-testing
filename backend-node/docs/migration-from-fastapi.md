# Migrating from the Python/FastAPI backend

This backend was built as a full rewrite of a `../backend` (Python/
FastAPI/Pydantic/pgvector) that existed earlier in this project, to
Node.js/Express/TypeScript, per an explicit brief: no FastAPI or Python
in the application logic, OKF instead of embeddings for tool/document
discovery, official `@google/genai` and `@modelcontextprotocol/sdk`
TypeScript SDKs, `pg` + `node-pg-migrate` + Zod instead of SQLAlchemy/
Alembic/Pydantic, Vitest instead of pytest. The Python backend was kept
running, untouched, as the reference implementation for the duration of
that build - and has since been fully decommissioned and removed from
this repository. This backend is now the only one and the sole source of
truth for everything; this document is kept as a historical record of
what changed and why, including an incident during decommissioning (see
"Bugs found and fixed during the port" below) that's worth learning from
even though the Python side it affected no longer exists.

## What's identical on purpose

- The 10 tools, their names, arguments, and business semantics (financial
  definitions, pagination caps, null-vs-zero rules).
- The database schema (table/column/constraint names) - see
  [database.md](database.md).
- Tenant isolation and the customer-role RLS design - see
  [security.md](security.md).
- The deterministic seed data's *content* (same trip numbers, same
  figures, same facts) and the UUID *algorithm* (`uuid.uuid5` in Python,
  `uuidv5` in Node, verified byte-identical for identical string inputs).
  Not every individual UUID value, though - see
  [database.md](database.md) "Deterministic IDs" for which entity types'
  UUIDs do and don't actually match across the two backends' separate
  databases, and why.
- The dev-auth demo identities and tenant/customer ids.

## What's structurally different, and why

| Python backend | This backend | Why |
|---|---|---|
| pgvector + embeddings for tool/document retrieval | OKF markdown bundle (`../knowledge`), no ranking | The brief for this backend explicitly replaces embeddings-based discovery with OKF; with only 10 tools, every role-allowed tool is simply offered every time - see [okf.md](okf.md) |
| SQLAlchemy ORM | Raw parameterized `pg` queries in `src/repositories/*.ts` | Brief specifies no ORM; RLS-bearing queries are simple enough that an ORM adds a layer to reason about without removing the need to understand the actual SQL |
| Alembic migrations | `node-pg-migrate`, same table/column names | Direct SQL port - see `migrations/*.ts` |
| Pydantic schemas | Zod schemas (`src/schemas/*.ts`) | TypeScript-native equivalent; same validation semantics, including cross-field `.superRefine()` checks |
| `google-genai` (Python) | `@google/genai` (TypeScript) | Same provider, different SDK; API shapes differ slightly (see below) |
| Official MCP Python SDK | Official MCP TypeScript SDK, Streamable HTTP | Same protocol; `registerTool`'s `inputSchema` takes a raw Zod *shape* object (`.shape` of a `ZodObject`), not a wrapped schema - confirmed from the SDK's own example source, not guessed from `.d.ts` files alone |
| pytest | Vitest | TypeScript-native equivalent; same test categories (unit/integration/security/evaluation) |

## Bugs found and fixed during the port

These are callouts because a straight line-for-line port would have
reproduced them, or introduced new ones specific to the Node/`pg`/`decimal.js`
toolchain:

- **`pg` DATE-column timezone shift.** `pg` auto-parses SQL `DATE` into a
  JS `Date` at local midnight, which serializes back out shifted by a day
  in most timezones (caught via a live `due_date` showing
  `"2026-09-17T18:30:00.000Z"` instead of `"2026-09-18"`). Fixed globally
  in `src/db/pgTypes.ts` by overriding the OID-1082 type parser to return
  the raw string. Python's driver (`asyncpg`/`psycopg`) doesn't have this
  specific behavior, so it's a Node-toolchain-specific bug, not something
  carried over from the Python side.
- **UTC-vs-local date-getter bug in relative date parsing.**
  `parseRelativeDateRange` originally used `today.getFullYear()`/
  `getMonth()` (local-timezone getters) on a UTC-constructed `Date`. This
  happened to work correctly on the UTC+5:30 development machine it was
  written on, but would silently shift by a day on any UTC-behind
  timezone - most CI runners and US machines. Caught proactively (not via
  a failing test) by diffing local vs. UTC getters in a diagnostic script,
  and fixed to `getUTCFullYear()`/`getUTCMonth()` before it ever produced
  a visible failure.
- **Gemini Developer API rejects `additionalProperties`.** Both Zod v4's
  `z.toJSONSchema()` and Python's Pydantic generate `additionalProperties:
  false` by default in their JSON Schema output, which the Gemini
  *Developer* API's `responseSchema` rejects outright (Vertex AI tolerates
  it - same provider, different API surface, different validation). Fixed
  with a recursive key-stripper (`src/planner/schemaToGemini.ts`) on both
  backends independently, since both SDKs have the same default-generation
  behavior.
- **Cross-database Postgres role collision.** Both backends independently
  created a role named `app_runtime` on the *same local Postgres cluster*
  (`docker-compose`'s single Postgres instance, two separate databases).
  Postgres roles are cluster-global, not per-database, so the second
  backend's migration failed with `role "app_runtime" cannot be dropped
  because some objects depend on it`. Fixed by renaming this backend's
  role to `app_runtime_node` everywhere (migrations, `src/db/pool.ts`,
  `.env*`, scripts, tests), then manually cleaning up the stale old
  role's grants/policies in `logistics_demo_node` only - verified
  afterward that the Python backend's own database and role were
  completely untouched throughout.
- **`backend-node/.env` was, at one point, a literal copy of
  `backend/.env`.** This is both a bug and the explanation for an
  incident worth being explicit about: with the wrong `DATABASE_URL`/
  `ADMIN_DATABASE_URL` in place, this backend's own scripts silently
  operated against the *Python* backend's live `logistics_demo` database
  and `app_runtime`/`logistics` roles instead of its own
  `logistics_demo_node` - connecting successfully, because the two
  schemas are structurally identical, so nothing failed loudly until a
  reseed collided with pre-existing rows. A `TRUNCATE` run while
  diagnosing that collision emptied Python's `logistics_documents`
  (3 rows) and its `document_chunks`, which had to be restored
  separately; it also surfaced a second, independent, pre-existing
  discrepancy (see [database.md](database.md) "Deterministic IDs") where
  `trip_id`/`billing_id`/`expense_id` are *not* actually identical
  between the two backends, because the two seed scripts format the
  tenant id differently (`tenant_id.hex` in Python vs. the dashed UUID
  string in Node) before hashing it in. **Lesson: before running anything
  destructive (`TRUNCATE`, a reset script) against a database identified
  only by a `.env` value, print and verify the actual resolved connection
  target first** - a wrong-but-structurally-compatible target can connect
  and partially succeed without ever raising an obvious error. Separately:
  avoid dumping a full `.env` file's contents for diagnosis - redact every
  line, not just ones matching a `://user:pass@` pattern, since a bare
  `KEY=value` secret (this incident's exposed `GEMINI_API_KEY`) won't
  match a connection-string-shaped regex at all.
- **Planner precision regression in the offline fallback planner.** A
  single-trip question containing an incidental keyword like "vehicle" or
  "driver" (e.g. *"Who was the driver for TRIP-1001?"*) triggered both the
  correct single-trip tool *and* a second, irrelevant fleet/driver tool
  call with a garbled argument scraped by a naive regex. Fixed by gating
  the fleet/driver/customer-aggregate branches on "no trip number already
  matched" - see [tools.md](tools.md) "The offline fallback planner" and
  the regression cases added to `tests/evaluation/plannerEval.test.ts`.

## Wire-format compatibility: reusing the frontend as-is

The brief asked to reuse `../frontend` rather than rewrite it. It was
built against the Python backend's Pydantic-default snake_case JSON; this
backend's internal code is idiomatic camelCase. Bridged with a single
response-boundary transform (`src/api/caseTransform.ts`), verified end-to-
end via a live curl against the running server diffed field-by-field
against `frontend/src/types/api.ts` - zero frontend changes were needed.
See [architecture.md](architecture.md) for the one place (`inputSchema`'s
*value*) this transform is deliberately **not** applied, to avoid mangling
JSON Schema's own keywords.

## Running this backend end-to-end

```bash
cd backend-node
cp .env.example .env            # fill in GEMINI_API_KEY if you have one;
                                 # the app runs fully offline without it
npm install
npm run db:migrate               # creates app_runtime_node, applies RLS
npm run db:seed                  # idempotent demo data
npm run db:check                 # sanity check
npm test                         # 107 tests, no network required
npx tsx src/server.ts            # http://localhost:8001
```

The frontend's `VITE_API_BASE_URL` now defaults to `http://localhost:8001`
(this backend) directly - it has no other backend to point at any more.
Everything else - the
dev-auth `X-Demo-User` header, the customer-only login selector, the
request/response shapes - is identical between the two backends.
