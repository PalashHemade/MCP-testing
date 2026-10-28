# Database

PostgreSQL. Schema is a deliberate, column-for-column port of the Python
backend's Alembic migration `0001_initial_schema`, minus pgvector (this
backend has no embeddings table - see [okf.md](okf.md)). Migrations are
plain SQL run through `node-pg-migrate` (`migrations/*.ts`,
`pgm.sql(...)` blocks - no ORM, no query builder; see [tools.md](tools.md)
for why raw `pg` was chosen for the query layer too).

## Tables

| Table | Purpose | Tenant-scoped via |
|---|---|---|
| `tenants` | One row per logistics company (demo has 2: Primary Logistics Co, Secondary Freight Co) | is the tenant |
| `customers` | A tenant's customers - the entity a "customer" login maps to | `tenant_id` |
| `vehicles` | Fleet | `tenant_id` |
| `drivers` | Driver roster | `tenant_id` |
| `trips` | The core operational record | `tenant_id`, `customer_id` |
| `trip_billing` | Invoices against a trip (0, 1, or many) | `tenant_id`, via `trip_id` |
| `trip_expenses` | Itemized cost entries against a trip | `tenant_id`, via `trip_id` |
| `logistics_documents` | Policy/port-regulation text, full-text searched | `tenant_id` (nullable = global) |

Every multi-tenant table carries its own `tenant_id` rather than relying on
joins to derive it, specifically so the Row-Level Security policies in
[security.md](security.md) can filter `trips`/`trip_billing`/`trip_expenses`
directly without a subquery on the hot path for the two tables that don't
have their own `customer_id` (billing/expenses resolve customer scope via
their `trip_id`).

Enums: `trip_status`, `vehicle_status`, `driver_status`, `payment_status`,
`expense_category`, `document_type` - see the migration for the exact value
sets, and `src/schemas/domain.ts` for their Zod mirrors.

## Document search: full-text, not embeddings

`logistics_documents.content_tsv` is a generated, stored `tsvector` column
(`GENERATED ALWAYS AS (to_tsvector('english', content)) STORED`) with a GIN
index. `search_logistics_documents` (Tool 10, see [tools.md](tools.md))
queries it with Postgres's built-in full-text search (`to_tsquery`/`@@`,
ranked with `ts_rank`), falling back to a plain keyword-overlap `ILIKE` scan
if the FTS query returns nothing. There is no vector column, no embedding
model call, and no ranking model in this backend - this is the one place
where the earlier Python implementation's pgvector-based semantic search
was replaced with something structurally different, per this backend's
original brief - and, now that that implementation has been fully
decommissioned, with no pgvector anywhere in this project at all.

## Two Postgres roles

| Role | Used by | Privileges |
|---|---|---|
| `logistics` | migrations, seed script, admin/reset scripts (`ADMIN_DATABASE_URL`) | owns every table; bypasses RLS as owner |
| `app_runtime_node` | the running Express app and the standalone MCP server (`DATABASE_URL`) | `SELECT` only, on exactly the 8 tables it needs; `FORCE ROW LEVEL SECURITY` applies to it |

**Postgres roles are cluster-global, not per-database.** This role is
named `app_runtime_node`, not the more obvious `app_runtime`, because an
earlier Python implementation of this same backend (since fully
decommissioned and removed) had already created a role named
`app_runtime` on the same local Postgres instance - discovered the hard
way when its presence collided with this backend's own migration; see
[migration-from-fastapi.md](migration-from-fastapi.md). The old
`app_runtime`/`logistics_demo` role and database may still exist as
inert, unused leftovers on a local Postgres instance that previously ran
both backends - safe to drop if you want to reclaim the name, but nothing
in this backend references them.

Only the admin pool (`src/db/adminPool.ts`, used solely by
`src/scripts/*.ts` and migrations) can see across tenants without
restriction. Nothing in the request-serving path ever uses it.

## Running migrations / seed / reset

```bash
npm run db:migrate   # applies migrations/*.ts, using ADMIN_DATABASE_URL
npm run db:status     # what's applied vs pending
npm run db:seed       # idempotent - upserts the same 26 trips / 25 invoices
                      # / 48 expenses / 3 documents every time, by
                      # deterministic UUID (src/db/seedIds.ts)
npm run db:check      # sanity-checks table/role/RLS presence
npm run db:reset       # DESTRUCTIVE - drops and recreates everything in
                      # the dev database only; requires
                      # ALLOW_DESTRUCTIVE_DB_OPERATIONS=true in .env
npm run db:rollback    # reverts the most recent migration
```

The seed data intentionally includes edge cases exercised by the test suite
and worth knowing about when exploring manually: `TRIP-1005` has a negative
profit, `TRIP-1006` is missing `distance_km` (so `profit_per_km` is `null`),
`TRIP-1008` is cancelled with a draft invoice, `TRIP-1009` has multiple
invoices, and `TRIP-1010` has billing but zero expense rows recorded.

## Deterministic IDs

Every seeded row's primary key is `uuidv5(parts.join(":"), SEED_NAMESPACE)`
(`src/db/seedIds.ts`), not a random UUID. Re-running `db:seed` upserts the
same rows rather than duplicating them (matched by primary key - see the
caution below about what breaks this) - verified directly, Node's `uuid`
package's `v5(name, namespace)` produces byte-identical UUIDs to Python's
`uuid.uuid5(namespace, name)` for identical string inputs.

**That does not automatically mean the two backends produce the same
UUID for "the same" row** - it depends on both seed scripts feeding the
algorithm the exact same strings. `customer_id`/`vehicle_id`/`driver_id`/
`document_id`/`chunk_id`/`tool_id` are built from short literal labels
(`"primary"`, `"acme"`, ...) in both `seedDemo.ts` and Python's
`seed_demo.py`, so those *do* match exactly across the two separate
databases. `trip_id`/`billing_id`/`expense_id`, however, incorporate the
tenant id as part of the string, and the two scripts format it
differently: Python's `seed_demo.py` passes `tenant_id.hex` (32 hex
characters, no dashes), this backend's `seedDemo.ts` passes the standard
dashed UUID string - same algorithm, different input string, different
(but each internally self-consistent) output UUID. This has no effect on
either backend's own correctness, but don't assume a trip's UUID is
portable between the two databases (`logistics_demo` vs
`logistics_demo_node`), and if you ever write a script that seeds across
both, match the exact string format the target backend's own seed script
uses for that id.
