import { v5 as uuidv5 } from "uuid";

/** Deterministic UUID generation shared by the demo-user registry and
 * the seed script - same algorithm (RFC 4122 v5 / SHA-1) and same
 * namespace as the Python backend's app.seed_ids.deterministic_id,
 * verified to produce IDENTICAL UUIDs for the same inputs. Not required
 * for correctness (this backend uses its own database,
 * logistics_demo_node), but keeps the two implementations' demo data
 * trivially comparable.
 */
const SEED_NAMESPACE = "00000000-0000-0000-0000-000000000000";

export function deterministicId(...parts: string[]): string {
  return uuidv5(parts.join(":"), SEED_NAMESPACE);
}
