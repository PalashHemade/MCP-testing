# Database

PostgreSQL 15+ with the `pgvector` extension (installed by migration `0001`).
Local dev uses `pgvector/pgvector:pg16` via `docker-compose.yml`. UUID primary
keys throughout, generated application-side (`uuid.uuid4`/`uuid.uuid5`), not by
a Postgres extension - this avoids a `pgcrypto`/`uuid-ossp` dependency.

## Tables

`tenants`, `customers`, `vehicles`, `drivers`, `trips`, `trip_billing`,
`trip_expenses`, `logistics_documents`, `document_chunks`, `tool_metadata` -
see `backend/app/models/*.py` for exact columns; this doc covers what isn't
obvious from the column list alone.

### Tenant isolation at the schema level

`customers`, `vehicles`, and `drivers` each carry a `UNIQUE(tenant_id, <id>)`
constraint. `trips` has **composite foreign keys** `(tenant_id, customer_id)`,
`(tenant_id, vehicle_id)`, `(tenant_id, driver_id)` against those tables - this
is what actually makes "a trip cannot reference another tenant's customer/
vehicle/driver" a database-level guarantee, not just an application convention.
`trip_billing` and `trip_expenses` carry the same pattern against `trips`.

This is enforced by foreign-key constraints, **not** Postgres Row-Level
Security - see [security.md](security.md) for why, and for how tenant scoping
is actually enforced on every read.

### Multiple invoices per trip

`trip_billing` has no uniqueness constraint on `trip_id` alone - a trip can
have any number of invoice rows. `app.services.financials` aggregates **across
all of a trip's invoices** (see "Financial definitions" below), so adding a
second invoice can never corrupt a profit calculation by double-counting
expenses (expenses are fetched once per trip, independent of how many invoice
rows exist). The seed data mostly uses one invoice per trip for simplicity;
`TRIP-1009` is seeded with two specifically to exercise this.

### `logistics_documents.tenant_id` is nullable

`NULL` means a globally-visible demo document (e.g. a generic port
regulation); a non-null value means it is private to that tenant.
`DocumentRepository.search_candidates` only ever returns rows where
`tenant_id IS NULL OR tenant_id = :caller_tenant` - see
`tests/integration/test_tenant_isolation.py` for the proof.

## Financial definitions

Implemented once, in `app.services.financials`, and used by every tool/service
that touches money - nothing else re-derives these:

- **Gross billed amount** = `freight_charge + additional_charges + tax_amount`.
- **Outstanding balance** = gross billed amount − amount paid.
- **Invoice inclusion rule**: aggregates ("billed revenue", trip-level gross/
  profit) include only invoices with `payment_status` in
  `{unpaid, partially_paid, paid}`. `draft` (not yet finalized) and
  `cancelled` (voided) invoices are **excluded** from revenue/profit, but are
  still returned in `get_trip_financials.invoices` for transparency. There is
  no credit-note concept in this schema - a correction is represented as
  editing/cancelling an invoice, not a separate credit-note row; this is a
  documented limitation, not a silently-assumed equivalence.
- **Trip expenses** = sum of that trip's `trip_expenses` rows. A trip with **no
  expense rows** is reported with `has_expense_data=false` alongside a `0`
  total - the `0` is never presented as proof the trip had no real cost.
- **Trip profit** = included gross billed amount − trip expenses. `None`
  (not `0`) when the trip has no invoice at all (`has_billing_data=false`).
  Can be negative (seeded example: `TRIP-1005`).
- **Profit per kilometre** = trip profit ÷ `distance_km`, only when
  `distance_km` is present and `> 0`; otherwise `None` (seeded example:
  `TRIP-1006`, which has no recorded distance).
- **Billed revenue** (customer/route aggregates) = sum of gross billed amount
  over the included invoices of the trips in scope, per the same inclusion
  rule above.
- **Cancelled trips**: not excluded from financial reporting - whatever
  billing/expenses exist are still shown (seeded example: `TRIP-1008`, a
  cancelled trip with a `draft` invoice excluded from gross, and a real toll
  expense incurred before cancellation, giving `trip_profit = -500`).
- **Aggregate profit-per-km** (`compare_route_profitability`) =
  `sum(trip profit) / sum(trip distance_km)` across the route's trips - this
  is explicitly **not** an average of each trip's individual ratio, which
  would weight short/long trips incorrectly.

All money fields are `NUMERIC`, never floating point; all arithmetic in
`app.services.financials` uses `Decimal`.

## Migrations

Alembic, authoritative schema source. Two revisions today:
`0001_initial_schema` creates every table, constraint, index, and the
`vector` extension; `0002_customer_row_level_security` adds the
`app_runtime` role and the Row-Level Security policies described in
[security.md](security.md) "Row-Level Security." Upgrade and downgrade are
both implemented and tested for both revisions (`alembic upgrade head` /
`alembic downgrade base` verified against the local compose DB while
building this).

Migrations and admin scripts (`seed_demo`, `rebuild_embeddings`,
`reset_dev_db`, `check_schema`) run as the privileged, table-owning
`ADMIN_DATABASE_URL` role (`logistics` locally) - they must bypass RLS to
see/write every row. The running FastAPI app connects separately as the
restricted `DATABASE_URL` role (`app_runtime`), which RLS actually applies
to. See `app/db/admin_session.py` vs. `app/db/session.py`.

```bash
alembic upgrade head        # fresh schema
alembic downgrade base      # drop everything this migration created
python -m app.scripts.check_schema   # verify tables + pgvector + row counts
```

### Supabase

- **Migrations** need a *direct* connection (the transaction-mode pooler on
  port 6543 does not reliably support the DDL/prepared-statement patterns
  Alembic + asyncpg use). Set `MIGRATION_DATABASE_URL` to Supabase's direct
  connection string (`db.<project-ref>.supabase.co:5432`) if your app traffic
  normally goes through a pooler.
- **App traffic** can use the session-mode pooler or a direct connection; this
  demo's `NullPool` engine (see `app/db/session.py`) opens a fresh connection
  per request either way, so a pooler in front of it is a reasonable choice at
  higher concurrency.
- Enable the `vector` extension in the Supabase dashboard (or let migration
  `0001`'s `CREATE EXTENSION IF NOT EXISTS vector` do it, if your role has
  permission).
- For RLS to mean anything on Supabase, `DATABASE_URL` must point at a role
  that is neither a superuser nor the table owner - Supabase's default
  `postgres` role is effectively a superuser and would silently bypass
  every policy migration `0002` creates, the same trap this demo's local
  `logistics` role would have been in without the separate `app_runtime`
  role. Create an equivalent restricted role for `DATABASE_URL` and keep
  `ADMIN_DATABASE_URL` pointed at the privileged one.

### Local Postgres

`docker compose up -d postgres` starts `pgvector/pgvector:pg16` on `localhost:5433`
with the credentials already in `backend/.env.example`.

## Seed data

`python -m app.scripts.seed_demo` - deterministic and idempotent (every row is
`session.merge()`-d by a stable primary key: fixed tenant UUIDs matching
`app.auth.dev_auth`, or `uuid.uuid5` over a natural key for everything else;
rerunning does not duplicate or corrupt rows - see
`tests/integration/test_seed_idempotency.py`).

Covers (see the script for exact values): 2 tenants, 4 customers, 4 vehicles
(including one in `maintenance` status), 5 drivers (including an intentionally
ambiguous `Ramesh Kumar` / `Ramesh Gupta` pair for driver-name-lookup testing),
26 trips across both tenants (completed/in-transit/cancelled, with and without
recorded distance), paid/partially-paid/unpaid invoices, a trip with two
invoices, a trip with no recorded expenses, a negative-profit trip, a trip with
no recorded distance, and 3 documents (2 global, 1 tenant-private) clearly
marked `is_demo_content=true` with an explicit "FICTIONAL" disclaimer in their
text.

Seed dates are computed relative to the real date the script is run (not a
fixed historical date), so natural-language demo questions like "last month's
billed revenue" keep working whenever you seed - `trip_number`/`invoice_number`/
`lr_number` are the stable identifiers to key test assertions off of, not
absolute dates.

## Reset (development/test only)

`python -m app.scripts.reset_dev_db` drops every application table and enum
type. It refuses to run unless `ALLOW_DESTRUCTIVE_DB_OPERATIONS=true` is set
**and** `APP_ENV != production` - this is the only guard between this script
and a real database.
