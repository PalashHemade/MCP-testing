/** Proves one tenant cannot retrieve another tenant's data, including
 * when a valid id belonging to the other tenant is supplied directly -
 * mirrors tests/integration/test_tenant_isolation.py in the Python
 * sibling backend. Runs via the admin (RLS-bypassing) client to isolate
 * application-level filtering as its own, independently-proven layer -
 * see tests/security/rowLevelSecurity.test.ts for the RLS-level proof.
 */
import { describe, expect, it } from "vitest";
import { DEV_USERS, TENANT_PRIMARY } from "../../src/auth/devAuth.js";
import { deterministicId } from "../../src/db/seedIds.js";
import * as getCustomerTripSummary from "../../src/mcp/tools/getCustomerTripSummary.js";
import * as getDriverTripHistory from "../../src/mcp/tools/getDriverTripHistory.js";
import * as getTripDetails from "../../src/mcp/tools/getTripDetails.js";
import * as getTripExpenses from "../../src/mcp/tools/getTripExpenses.js";
import * as getTripFinancials from "../../src/mcp/tools/getTripFinancials.js";
import * as getVehicleUtilization from "../../src/mcp/tools/getVehicleUtilization.js";
import * as searchLogisticsDocuments from "../../src/mcp/tools/searchLogisticsDocuments.js";
import { withAdminClient } from "../helpers.js";

const PRIMARY_TRIP_ID = deterministicId("trip", TENANT_PRIMARY, "TRIP-1001");
const PRIMARY_CUSTOMER_ID = deterministicId("customer", "primary", "acme");
const PRIMARY_VEHICLE_ID = deterministicId("vehicle", "primary", "v1");
const PRIMARY_DRIVER_ID = deterministicId("driver", "primary", "ramesh");

const secondaryUser = DEV_USERS["demo-ops-secondary"]!;
const primaryUser = DEV_USERS["demo-ops-primary"]!;

describe("tenant isolation", () => {
  it("secondary cannot get primary trip details by number", async () => {
    await withAdminClient(async (client) => {
      const out = await getTripDetails.run(client, secondaryUser, { tripNumber: "TRIP-1001" });
      expect(out.found).toBe(false);
    });
  });

  it("secondary cannot get primary trip by valid id", async () => {
    await withAdminClient(async (client) => {
      const out = await getTripDetails.run(client, secondaryUser, { tripId: PRIMARY_TRIP_ID });
      expect(out.found).toBe(false);
    });
  });

  it("secondary cannot get primary trip financials", async () => {
    await withAdminClient(async (client) => {
      const out = await getTripFinancials.run(client, secondaryUser, { tripId: PRIMARY_TRIP_ID });
      expect(out.found).toBe(false);
      expect(out.financials).toBeNull();
    });
  });

  it("secondary cannot get primary trip expenses", async () => {
    await withAdminClient(async (client) => {
      const out = await getTripExpenses.run(client, secondaryUser, { tripId: PRIMARY_TRIP_ID });
      expect(out.found).toBe(false);
      expect(out.expenses).toEqual([]);
    });
  });

  it("secondary cannot get primary customer summary", async () => {
    await withAdminClient(async (client) => {
      const out = await getCustomerTripSummary.run(client, secondaryUser, { customerId: PRIMARY_CUSTOMER_ID });
      expect(out.results).toEqual([]);
    });
  });

  it("secondary cannot get primary vehicle utilization", async () => {
    await withAdminClient(async (client) => {
      const out = await getVehicleUtilization.run(client, secondaryUser, { vehicleId: PRIMARY_VEHICLE_ID });
      expect(out.results).toEqual([]);
    });
  });

  it("secondary cannot get primary driver history", async () => {
    await withAdminClient(async (client) => {
      const out = await getDriverTripHistory.run(client, secondaryUser, { driverId: PRIMARY_DRIVER_ID });
      expect(out.driver).toBeNull();
      expect(out.trips).toEqual([]);
    });
  });

  it("secondary cannot retrieve primary's private document", async () => {
    await withAdminClient(async (client) => {
      const out = await searchLogisticsDocuments.run(client, secondaryUser, {
        query: "fuel toll expense allowance policy receipt",
        limit: 5,
      });
      const titles = out.passages.map((p) => p.title);
      expect(titles).not.toContain("Primary Logistics Co Internal Expense Policy");
    });
  });

  it("global demo document is visible to both tenants", async () => {
    await withAdminClient(async (client) => {
      for (const user of [primaryUser, secondaryUser]) {
        const out = await searchLogisticsDocuments.run(client, user, {
          query: "port entry documentation requirements",
          limit: 5,
        });
        const titles = out.passages.map((p) => p.title);
        expect(titles).toContain("Demo Port Entry Documentation Policy");
      }
    });
  });
});
