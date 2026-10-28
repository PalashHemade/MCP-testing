/** Destructive reset of a DEVELOPMENT/TEST database only. Refuses to run
 * unless ALLOW_DESTRUCTIVE_DB_OPERATIONS=true - the only guard standing
 * between this script and a real database.
 */
import "../config/loadEnv.js";
import { getAdminPool } from "../db/adminPool.js";
import { getSettings } from "../config/settings.js";

const TABLES = [
  "logistics_documents", "trip_expenses", "trip_billing", "trips",
  "drivers", "vehicles", "customers", "tenants", "pgmigrations",
];
const ENUM_TYPES = ["trip_status", "vehicle_status", "driver_status", "payment_status", "expense_category", "document_type"];

async function reset(): Promise<void> {
  const settings = getSettings();
  if (!settings.allowDestructiveDbOperations) {
    console.error(
      "Refusing to reset: ALLOW_DESTRUCTIVE_DB_OPERATIONS is not set to true. This script drops " +
        "all application tables and must only be pointed at a development or test database.",
    );
    process.exit(1);
  }
  if (settings.isProduction) {
    console.error("Refusing to reset: APP_ENV=production.");
    process.exit(1);
  }

  const pool = getAdminPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of TABLES) {
      await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    for (const type of ENUM_TYPES) {
      await client.query(`DROP TYPE IF EXISTS ${type} CASCADE`);
    }
    // Dropping tables does not drop the app_runtime_node role itself nor its
    // schema-level USAGE grant - clear both before DROP ROLE, or Postgres
    // refuses with "cannot be dropped because some objects depend on it".
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime_node') THEN
          REVOKE ALL PRIVILEGES ON SCHEMA public FROM app_runtime_node;
        END IF;
      END
      $$;
    `);
    await client.query("DROP ROLE IF EXISTS app_runtime_node");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log("Database reset complete. Run 'npm run db:migrate' then 'npm run db:seed' next.");
  process.exit(0);
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
