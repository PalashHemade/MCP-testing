import type { Pool, PoolClient } from "pg";

/** Generic upsert-by-primary-key, used by the seed script for
 * idempotency: rerunning the seed updates the same deterministic rows in
 * place rather than duplicating them (mirrors session.merge() in the
 * Python sibling backend's seed script). */
export async function upsert(
  executor: Pool | PoolClient,
  table: string,
  primaryKey: string,
  row: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(row);
  const values = columns.map((c) => row[c]);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const updateClause = columns
    .filter((c) => c !== primaryKey)
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");

  const sql = updateClause
    ? `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ` +
      `ON CONFLICT (${primaryKey}) DO UPDATE SET ${updateClause}`
    : `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ` +
      `ON CONFLICT (${primaryKey}) DO NOTHING`;

  await executor.query(sql, values);
}
