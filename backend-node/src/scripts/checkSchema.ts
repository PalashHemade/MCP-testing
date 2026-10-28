import "../config/loadEnv.js";
import { getAdminPool } from "../db/adminPool.js";
import { getSettings } from "../config/settings.js";

const EXPECTED_TABLES = [
  "tenants", "customers", "vehicles", "drivers", "trips", "trip_billing",
  "trip_expenses", "logistics_documents",
];

async function check(): Promise<void> {
  const settings = getSettings();
  console.log(`APP_ENV=${settings.appEnv}  DATABASE_URL=${settings.databaseUrl.split("@").pop()}`);

  const pool = getAdminPool();
  const tablesResult = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
  );
  const found = new Set(tablesResult.rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !found.has(t));
  if (missing.length > 0) {
    console.log(`MISSING TABLES: ${missing.join(", ")} - run 'npm run db:migrate'.`);
  } else {
    console.log(`All ${EXPECTED_TABLES.length} expected tables are present.`);
  }

  const roleResult = await pool.query<{ rolname: string; rolsuper: boolean; rolcanlogin: boolean }>(
    "SELECT rolname, rolsuper, rolcanlogin FROM pg_roles WHERE rolname = 'app_runtime_node'",
  );
  if (roleResult.rows.length === 0) {
    console.log("app_runtime_node role: MISSING - run 'npm run db:migrate'.");
  } else {
    const role = roleResult.rows[0]!;
    console.log(`app_runtime_node role: superuser=${role.rolsuper} canLogin=${role.rolcanlogin} (expect false/true)`);
  }

  const rlsResult = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('trips','trip_billing','trip_expenses')",
  );
  for (const row of rlsResult.rows) {
    console.log(`  RLS on ${row.relname}: enabled=${row.relrowsecurity} forced=${row.relforcerowsecurity}`);
  }

  for (const table of EXPECTED_TABLES.filter((t) => found.has(t))) {
    const countResult = await pool.query<{ count: string }>(`SELECT count(*) FROM ${table}`);
    console.log(`  ${table}: ${countResult.rows[0]!.count} rows`);
  }

  process.exit(0);
}

check().catch((err) => {
  console.error(err);
  process.exit(1);
});
