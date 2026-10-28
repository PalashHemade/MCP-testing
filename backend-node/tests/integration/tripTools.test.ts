/** Business-logic correctness at the tool level - mirrors
 * tests/integration/test_trip_tools.py in the Python sibling backend.
 */
import { describe, expect, it } from "vitest";
import { DEV_USERS } from "../../src/auth/devAuth.js";
import * as compareRouteProfitability from "../../src/mcp/tools/compareRouteProfitability.js";
import * as getDriverTripHistory from "../../src/mcp/tools/getDriverTripHistory.js";
import * as getTripFinancials from "../../src/mcp/tools/getTripFinancials.js";
import * as getVehicleUtilization from "../../src/mcp/tools/getVehicleUtilization.js";
import * as listTrips from "../../src/mcp/tools/listTrips.js";
import * as listUnpaidInvoices from "../../src/mcp/tools/listUnpaidInvoices.js";
import { withAdminClient } from "../helpers.js";

const primaryUser = DEV_USERS["demo-ops-primary"]!;

describe("trip tools", () => {
  it("list_trips pagination flags a partial result", async () => {
    await withAdminClient(async (client) => {
      const out = await listTrips.run(client, primaryUser, { limit: 5, offset: 0 });
      expect(out.pageInfo.returnedCount).toBe(5);
      expect(out.pageInfo.totalCount).toBeGreaterThan(5);
      expect(out.completeness).toBe("partial");
      expect(out.pageInfo.hasMore).toBe(true);
    });
  });

  it("list_trips full page is complete", async () => {
    await withAdminClient(async (client) => {
      const out = await listTrips.run(client, primaryUser, { limit: 500, offset: 0 });
      expect(out.pageInfo.hasMore).toBe(false);
      expect(out.completeness).toBe("complete");
    });
  });

  it("multiple invoices aggregate without double counting expenses", async () => {
    await withAdminClient(async (client) => {
      const out = await getTripFinancials.run(client, primaryUser, { tripNumber: "TRIP-1009" });
      const f = out.financials!;
      expect(f.invoices.length).toBe(2);
      expect(f.grossBilledAmount).toBe("28500.00");
      expect(f.amountPaid).toBe("23000.00");
      expect(f.outstandingBalance).toBe("5500.00");
      expect(f.recordedExpenses).toBe("3500.00");
      expect(f.tripProfit).toBe("25000.00");
    });
  });

  it("unpaid invoices default scope excludes draft and paid", async () => {
    await withAdminClient(async (client) => {
      const out = await listUnpaidInvoices.run(client, primaryUser, { limit: 500, offset: 0 });
      for (const inv of out.invoices) {
        expect(["unpaid", "partially_paid"]).toContain(inv.paymentStatus);
      }
      const invoiceNumbers = new Set(out.invoices.map((i) => i.invoiceNumber));
      expect(invoiceNumbers.has("INV-TRIP-1008-A")).toBe(false); // draft, excluded
    });
  });

  it("route profitability is directional", async () => {
    await withAdminClient(async (client) => {
      const out = await compareRouteProfitability.run(client, primaryUser, { minSampleSize: 1 });
      const routes = new Set(out.results.map((r) => `${r.origin}->${r.destination}`));
      expect(routes.has("Mumbai->Delhi")).toBe(true);
      expect(routes.has("Delhi->Mumbai")).toBe(false);
    });
  });

  it("vehicle utilization reports counts/distance, never a percentage", async () => {
    await withAdminClient(async (client) => {
      const out = await getVehicleUtilization.run(client, primaryUser, {});
      expect(out.results.length).toBe(3);
      for (const r of out.results) {
        expect(r.tripCount).toBeGreaterThanOrEqual(0);
        expect("utilizationPercentage" in r).toBe(false);
      }
    });
  });

  it("ambiguous driver name returns candidates, not a guess", async () => {
    await withAdminClient(async (client) => {
      const out = await getDriverTripHistory.run(client, primaryUser, { driverName: "Ramesh", limit: 50, offset: 0 });
      expect(out.ambiguous).toBe(true);
      expect(out.matchingDrivers.length).toBe(2);
      expect(out.trips).toEqual([]);
    });
  });

  it("unambiguous driver name resolves", async () => {
    await withAdminClient(async (client) => {
      const out = await getDriverTripHistory.run(client, primaryUser, { driverName: "Vikram", limit: 50, offset: 0 });
      expect(out.ambiguous).toBe(false);
      expect(out.driver?.driverName).toBe("Vikram Singh");
    });
  });

  it("unknown driver name is not found", async () => {
    await withAdminClient(async (client) => {
      const out = await getDriverTripHistory.run(client, primaryUser, { driverName: "NoSuchDriverXYZ", limit: 50, offset: 0 });
      expect(out.ambiguous).toBe(false);
      expect(out.driver).toBeNull();
      expect(out.trips).toEqual([]);
    });
  });
});
