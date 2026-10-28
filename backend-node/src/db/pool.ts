import { Pool, type PoolClient } from "pg";
import { getSettings } from "../config/settings.js";

/** The RUNNING APP's own connection pool - the restricted `app_runtime_node`
 * role (see migrations/0002_customer_row_level_security). It owns
 * nothing and is not a superuser, so Postgres Row-Level Security
 * actually applies to it. Never used by migration/seed/admin scripts -
 * see db/adminPool.ts for that.
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getSettings().databaseUrl });
  }
  return pool;
}

/** Runs `fn` with a client that has this request's tenant/customer scope
 * applied as Postgres session variables (checked by the RLS policies) -
 * the Node equivalent of app.auth.dependencies.get_scoped_db in the
 * Python backend.
 */
export async function withScopedClient<T>(
  scope: { tenantId: string; customerId: string | null },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [scope.tenantId]);
    await client.query("SELECT set_config('app.current_customer_id', $1, false)", [
      scope.customerId ?? "",
    ]);
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
