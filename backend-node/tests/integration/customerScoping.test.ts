/** Application-level enforcement for the "customer" role - mirrors
 * tests/integration/test_customer_scoping.py in the Python sibling
 * backend. See tests/security/rowLevelSecurity.test.ts for the
 * independent DB-level proof.
 */
import { describe, expect, it } from "vitest";
import { DEV_USERS, TENANT_PRIMARY } from "../../src/auth/devAuth.js";
import { deterministicId } from "../../src/db/seedIds.js";
import * as getCustomerTripSummary from "../../src/mcp/tools/getCustomerTripSummary.js";
import * as getTripDetails from "../../src/mcp/tools/getTripDetails.js";
import * as getTripFinancials from "../../src/mcp/tools/getTripFinancials.js";
import * as listTrips from "../../src/mcp/tools/listTrips.js";
import * as listUnpaidInvoices from "../../src/mcp/tools/listUnpaidInvoices.js";
import { withAdminClient } from "../helpers.js";

const BHARAT_TRIP_ID = deterministicId("trip", TENANT_PRIMARY, "TRIP-1002");
const BHARAT_CUSTOMER_ID = deterministicId("customer", "primary", "bharat");

const customerAcme = DEV_USERS["demo-customer-acme"]!;
const primaryUser = DEV_USERS["demo-ops-primary"]!;

describe("customer-role scoping", () => {
  it("customer sees own trip details", async () => {
    await withAdminClient(async (client) => {
      const out = await getTripDetails.run(client, customerAcme, { tripNumber: "TRIP-1001" });
      expect(out.found).toBe(true);
      expect(out.trip?.customerName).toBe("Acme Traders");
    });
  });

  it("customer cannot get another customer's trip by number", async () => {
    await withAdminClient(async (client) => {
      const out = await getTripDetails.run(client, customerAcme, { tripNumber: "TRIP-1002" });
      expect(out.found).toBe(false);
    });
  });

  it("customer cannot get another customer's trip by valid id", async () => {
    await withAdminClient(async (client) => {
      const out = await getTripDetails.run(client, customerAcme, { tripId: BHARAT_TRIP_ID });
      expect(out.found).toBe(false);
    });
  });

  it("customer cannot get another customer's financials", async () => {
    await withAdminClient(async (client) => {
      const out = await getTripFinancials.run(client, customerAcme, { tripId: BHARAT_TRIP_ID });
      expect(out.found).toBe(false);
      expect(out.financials).toBeNull();
    });
  });

  it("list_trips for customer only returns own trips", async () => {
    await withAdminClient(async (client) => {
      const out = await listTrips.run(client, customerAcme, { limit: 500, offset: 0 });
      const customerNames = new Set(out.trips.map((t) => t.customerName));
      expect(customerNames).toEqual(new Set(["Acme Traders"]));
    });
  });

  it("list_trips: customer cannot override scope via argument", async () => {
    await withAdminClient(async (client) => {
      const out = await listTrips.run(client, customerAcme, {
        customerId: BHARAT_CUSTOMER_ID,
        limit: 500,
        offset: 0,
      });
      const customerNames = new Set(out.trips.map((t) => t.customerName));
      expect(customerNames).toEqual(new Set(["Acme Traders"]));
      expect(out.trips.length).toBeGreaterThan(0);
    });
  });

  it("get_customer_trip_summary forces own scope", async () => {
    await withAdminClient(async (client) => {
      const out = await getCustomerTripSummary.run(client, customerAcme, { customerId: BHARAT_CUSTOMER_ID });
      expect(out.results.length).toBe(1);
      expect(out.results[0]!.customerName).toBe("Acme Traders");
    });
  });

  it("unpaid invoices scoped to customer", async () => {
    await withAdminClient(async (client) => {
      const customerOut = await listUnpaidInvoices.run(client, customerAcme, { limit: 500, offset: 0 });
      const operatorOut = await listUnpaidInvoices.run(client, primaryUser, { limit: 500, offset: 0 });
      const customerNames = new Set(customerOut.invoices.map((i) => i.customerName));
      for (const n of customerNames) expect(n).toBe("Acme Traders");
      const operatorNames = new Set(operatorOut.invoices.map((i) => i.customerName));
      expect(operatorNames.size).toBeGreaterThanOrEqual(customerNames.size);
    });
  });
});
