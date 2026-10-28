/** Proves Row-Level Security is a REAL backstop, not just documentation
 * - mirrors tests/integration/test_row_level_security.py in the Python
 * sibling backend. Connects as the actual restricted `app_runtime_node` role
 * (the same role src/db/pool.ts uses) and runs queries with NO tenant/
 * customer WHERE clause at all. If RLS weren't actually enforced (wrong
 * role, FORCE ROW LEVEL SECURITY missing), these would return every
 * tenant's/customer's rows; they must not.
 */
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { TENANT_PRIMARY, TENANT_SECONDARY } from "../../src/auth/devAuth.js";
import { deterministicId } from "../../src/db/seedIds.js";
import { setRlsScope, withRlsClient } from "../helpers.js";

const CUSTOMER_ACME = deterministicId("customer", "primary", "acme");
const CUSTOMER_BHARAT = deterministicId("customer", "primary", "bharat");

async function tripNumbers(client: PoolClient, sql = "SELECT trip_number FROM trips"): Promise<Set<string>> {
  const result = await client.query<{ trip_number: string }>(sql);
  return new Set(result.rows.map((r) => r.trip_number));
}

describe("Row-Level Security (real app_runtime_node role, no WHERE clause)", () => {
  it("no scope set returns zero rows (fail closed)", async () => {
    await withRlsClient(async (client) => {
      const numbers = await tripNumbers(client);
      expect(numbers.size).toBe(0);
    });
  });

  it("operator scope sees every customer in tenant, never another tenant", async () => {
    await withRlsClient(async (client) => {
      await setRlsScope(client, { tenantId: TENANT_PRIMARY, customerId: null });
      const numbers = await tripNumbers(client);
      expect(numbers.has("TRIP-1001")).toBe(true); // Acme
      expect(numbers.has("TRIP-1002")).toBe(true); // Bharat
      expect(numbers.has("TRIP-2001")).toBe(false); // secondary tenant
    });
  });

  it("customer scope sees only its own trips with no WHERE clause in the query", async () => {
    await withRlsClient(async (client) => {
      await setRlsScope(client, { tenantId: TENANT_PRIMARY, customerId: CUSTOMER_ACME });
      const numbers = await tripNumbers(client); // literally "SELECT trip_number FROM trips"
      expect(numbers.has("TRIP-1001")).toBe(true); // Acme's own trip
      expect(numbers.has("TRIP-1002")).toBe(false); // Bharat's trip - must not leak
    });
  });

  it("switching customer scope switches what is visible", async () => {
    await withRlsClient(async (client) => {
      await setRlsScope(client, { tenantId: TENANT_PRIMARY, customerId: CUSTOMER_BHARAT });
      const numbers = await tripNumbers(client);
      expect(numbers.has("TRIP-1002")).toBe(true);
      expect(numbers.has("TRIP-1001")).toBe(false);
    });
  });

  it("customer scope from the wrong tenant sees nothing", async () => {
    await withRlsClient(async (client) => {
      // Acme's customer_id exists only under TENANT_PRIMARY - claiming
      // TENANT_SECONDARY with it must not accidentally match anything.
      await setRlsScope(client, { tenantId: TENANT_SECONDARY, customerId: CUSTOMER_ACME });
      const numbers = await tripNumbers(client);
      expect(numbers.size).toBe(0);
    });
  });

  it("RLS applies to trip_billing via customer_id through trips", async () => {
    await withRlsClient(async (client) => {
      await setRlsScope(client, { tenantId: TENANT_PRIMARY, customerId: CUSTOMER_ACME });
      const result = await client.query<{ invoice_number: string }>("SELECT invoice_number FROM trip_billing");
      const numbers = result.rows.map((r) => r.invoice_number);
      expect(numbers.some((n) => n.startsWith("INV-TRIP-1001"))).toBe(true);
      expect(numbers.some((n) => n.startsWith("INV-TRIP-1002"))).toBe(false);
    });
  });

  it("RLS applies to trip_expenses via customer_id through trips", async () => {
    await withRlsClient(async (client) => {
      await setRlsScope(client, { tenantId: TENANT_PRIMARY, customerId: CUSTOMER_BHARAT });
      const result = await client.query<{ trip_number: string }>(
        `SELECT t.trip_number FROM trip_expenses e
         JOIN trips t ON t.trip_id = e.trip_id AND t.tenant_id = e.tenant_id`,
      );
      const numbers = new Set(result.rows.map((r) => r.trip_number));
      expect(numbers.has("TRIP-1002")).toBe(true); // Bharat owns this
      expect(numbers.has("TRIP-1001")).toBe(false); // Acme's trip
      expect(numbers.has("TRIP-1003")).toBe(false); // Oceanic's trip
    });
  });

  it("app_runtime_node role cannot write at all (SELECT-only grant)", async () => {
    await withRlsClient(async (client) => {
      await setRlsScope(client, { tenantId: TENANT_PRIMARY, customerId: CUSTOMER_ACME });
      await expect(
        client.query(
          `INSERT INTO trips (trip_id, tenant_id, trip_number, customer_id, vehicle_id, driver_id,
             lr_number, origin, destination, start_date, trip_status)
           VALUES ($1, $2, 'HACK-1', $3, $3, $3, 'HACK', 'x', 'y', now(), 'planned')`,
          ["99999999-9999-9999-9999-999999999999", TENANT_PRIMARY, CUSTOMER_ACME],
        ),
      ).rejects.toThrow();
    });
  });
});
