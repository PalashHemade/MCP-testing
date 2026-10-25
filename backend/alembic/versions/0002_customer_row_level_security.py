"""customer row-level security

Adds the app_runtime role (the running app's own DB role - NOT the table
owner, NOT a superuser, so Postgres RLS actually applies to it) and
Row-Level Security policies on trips/trip_billing/trip_expenses that
restrict visibility by tenant AND, for customer-role sessions, by
customer_id. The session variables app.current_tenant_id and
app.current_customer_id are set once per request by
app.auth.dependencies.get_scoped_db - see docs/security.md
"Row-Level Security" for the full design and why FORCE ROW LEVEL SECURITY
alone would not have been enough (the previous owner/migration role is a
superuser, which always bypasses RLS regardless of FORCE).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-26
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

READ_ONLY_TABLES = [
    "tenants", "customers", "vehicles", "drivers", "trips", "trip_billing",
    "trip_expenses", "logistics_documents", "document_chunks", "tool_metadata",
]

RLS_TABLES = ["trips", "trip_billing", "trip_expenses"]


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
                CREATE ROLE app_runtime LOGIN PASSWORD 'app_runtime_dev_password';
            END IF;
        END
        $$;
        """
    )
    op.execute("GRANT USAGE ON SCHEMA public TO app_runtime")
    for table in READ_ONLY_TABLES:
        op.execute(f"GRANT SELECT ON {table} TO app_runtime")

    # NULLIF(..., '')::uuid rather than a bare ::uuid cast guarded only by
    # "OR" short-circuiting: PostgreSQL's expression evaluator does NOT
    # guarantee that the right-hand side of OR is skipped just because the
    # left-hand side is true (see "Expression Evaluation Rules" in the
    # Postgres docs - order/short-circuiting is not defined), so a bare
    # `current_setting(...)::uuid` cast of the empty-string sentinel can
    # still raise "invalid input syntax for type uuid" even when the
    # intent is for that branch to be moot. NULLIF turns '' into NULL
    # first, and `customer_id = NULL` is simply NULL (never an error),
    # regardless of evaluation order.

    # trips: tenant check direct; customer check direct (trips.customer_id).
    op.execute("ALTER TABLE trips ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE trips FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_customer_isolation ON trips
        USING (
            tenant_id = current_setting('app.current_tenant_id', true)::uuid
            AND (
                coalesce(current_setting('app.current_customer_id', true), '') = ''
                OR customer_id = nullif(current_setting('app.current_customer_id', true), '')::uuid
            )
        )
        """
    )

    # trip_billing / trip_expenses: no customer_id column of their own -
    # the customer check goes through their trip_id's owning trip.
    for table in ("trip_billing", "trip_expenses"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_customer_isolation ON {table}
            USING (
                tenant_id = current_setting('app.current_tenant_id', true)::uuid
                AND (
                    coalesce(current_setting('app.current_customer_id', true), '') = ''
                    OR trip_id IN (
                        SELECT trip_id FROM trips
                        WHERE trips.tenant_id = {table}.tenant_id
                          AND trips.customer_id = nullif(current_setting('app.current_customer_id', true), '')::uuid
                    )
                )
            )
            """
        )


def downgrade() -> None:
    for table in RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_customer_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    for table in READ_ONLY_TABLES:
        op.execute(f"REVOKE SELECT ON {table} FROM app_runtime")
    op.execute("REVOKE USAGE ON SCHEMA public FROM app_runtime")
    op.execute("DROP ROLE IF EXISTS app_runtime")
