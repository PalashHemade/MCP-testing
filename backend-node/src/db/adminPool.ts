import { Pool } from "pg";
import { getSettings } from "../config/settings.js";

/** Privileged DB pool for migrations/seeding/admin scripts only - the
 * table-owning `logistics` role, which intentionally bypasses RLS.
 * Never import this from request-handling code (src/api/*, src/mcp/*,
 * src/services/*) - see docs/security.md "Row-Level Security".
 */
let adminPool: Pool | null = null;

export function getAdminPool(): Pool {
  if (!adminPool) {
    adminPool = new Pool({ connectionString: getSettings().adminDatabaseUrl });
  }
  return adminPool;
}

export async function closeAdminPool(): Promise<void> {
  if (adminPool) {
    await adminPool.end();
    adminPool = null;
  }
}
