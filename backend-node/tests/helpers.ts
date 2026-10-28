/** Shared test helpers.
 *
 * Integration tests use `withAdminClient` (the privileged, RLS-bypassing
 * role) wrapped in a transaction that's always rolled back - these test
 * application-level tenant/customer filtering (the repository/service
 * layer's own WHERE clauses), which must hold on its own regardless of
 * RLS.
 *
 * `withRlsClient` connects as the REAL restricted app_runtime_node role (no
 * scope set until the test calls setRlsScope) - used only by
 * tests/security/rowLevelSecurity.test.ts to prove RLS itself works,
 * independent of the application code above it.
 */
import "../src/config/loadEnv.js";
import type { PoolClient } from "pg";
import { getAdminPool } from "../src/db/adminPool.js";
import { getPool } from "../src/db/pool.js";

export async function withAdminClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getAdminPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    return result;
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

export async function withRlsClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    return result;
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

export async function setRlsScope(
  client: PoolClient,
  opts: { tenantId: string; customerId?: string | null },
): Promise<void> {
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [opts.tenantId]);
  await client.query("SELECT set_config('app.current_customer_id', $1, false)", [opts.customerId ?? ""]);
}
