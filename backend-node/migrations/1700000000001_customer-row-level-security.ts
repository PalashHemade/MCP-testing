import type { MigrationBuilder } from "node-pg-migrate";

/** Adds app_runtime_node (the running app's own DB role - NOT the table
 * owner, NOT a superuser, so Postgres RLS actually applies to it) and
 * RLS policies on trips/trip_billing/trip_expenses, restricting
 * visibility by tenant AND (for customer-role sessions) customer_id.
 * Direct port of the Python backend's
 * alembic/versions/0002_customer_row_level_security.py - see
 * docs/security.md "Row-Level Security" for the full design, including
 * why a bare `::uuid` cast on the empty-string "operator" sentinel must
 * go through NULLIF rather than relying on OR short-circuiting (not
 * guaranteed by Postgres).
 */
const READ_ONLY_TABLES = [
  "tenants",
  "customers",
  "vehicles",
  "drivers",
  "trips",
  "trip_billing",
  "trip_expenses",
  "logistics_documents",
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime_node') THEN
        CREATE ROLE app_runtime_node LOGIN PASSWORD 'app_runtime_dev_password';
      END IF;
    END
    $$;

    GRANT USAGE ON SCHEMA public TO app_runtime_node;
  `);

  for (const table of READ_ONLY_TABLES) {
    pgm.sql(`GRANT SELECT ON ${table} TO app_runtime_node;`);
  }

  pgm.sql(`
    ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
    ALTER TABLE trips FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_customer_isolation ON trips
    USING (
      tenant_id = current_setting('app.current_tenant_id', true)::uuid
      AND (
        coalesce(current_setting('app.current_customer_id', true), '') = ''
        OR customer_id = nullif(current_setting('app.current_customer_id', true), '')::uuid
      )
    );
  `);

  for (const table of ["trip_billing", "trip_expenses"]) {
    pgm.sql(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_customer_isolation ON ${table}
      USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        AND (
          coalesce(current_setting('app.current_customer_id', true), '') = ''
          OR trip_id IN (
            SELECT trip_id FROM trips
            WHERE trips.tenant_id = ${table}.tenant_id
              AND trips.customer_id = nullif(current_setting('app.current_customer_id', true), '')::uuid
          )
        )
      );
    `);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const table of ["trips", "trip_billing", "trip_expenses"]) {
    pgm.sql(`
      DROP POLICY IF EXISTS tenant_customer_isolation ON ${table};
      ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY;
      ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;
    `);
  }
  for (const table of READ_ONLY_TABLES) {
    pgm.sql(`REVOKE SELECT ON ${table} FROM app_runtime_node;`);
  }
  pgm.sql(`
    REVOKE USAGE ON SCHEMA public FROM app_runtime_node;
    DROP ROLE IF EXISTS app_runtime_node;
  `);
}
