import type { PoolClient } from "pg";
import { Decimal } from "decimal.js";
import { BillingRepository } from "../repositories/billingRepository.js";
import { ExpenseRepository } from "../repositories/expenseRepository.js";
import { TripRepository } from "../repositories/tripRepository.js";
import { sumExpenses, sumIncludedInvoices } from "./financials.js";
import type { InvoiceSummary } from "../schemas/domain.js";
import type { TripWithJoinsRow } from "../db/types.js";

export interface RouteProfitabilityResult {
  origin: string;
  destination: string;
  tripCount: number;
  grossBilledAmount: string;
  recordedExpenses: string;
  aggregateProfit: string;
  totalDistanceKm: string;
  aggregateProfitPerKm: string | null;
  excludedBelowMinSample: boolean;
}

export class RouteService {
  private readonly trips: TripRepository;
  private readonly billing: BillingRepository;
  private readonly expenses: ExpenseRepository;

  constructor(client: PoolClient) {
    this.trips = new TripRepository(client);
    this.billing = new BillingRepository(client);
    this.expenses = new ExpenseRepository(client);
  }

  async compareRouteProfitability(opts: {
    tenantId: string;
    startDate?: string;
    endDate?: string;
    origin?: string;
    destination?: string;
    minSampleSize: number;
  }): Promise<RouteProfitabilityResult[]> {
    const { rows } = await this.trips.listTrips({
      tenantId: opts.tenantId,
      startDate: opts.startDate,
      endDate: opts.endDate,
      origin: opts.origin,
      destination: opts.destination,
      limit: 500,
      offset: 0,
    });

    const groups = new Map<string, TripWithJoinsRow[]>();
    for (const row of rows) {
      const key = `${row.origin}\u0000${row.destination}`;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    const results: RouteProfitabilityResult[] = [];
    for (const [key, trips] of groups) {
      const [origin, destination] = key.split("\u0000") as [string, string];
      const tripIds = trips.map((t) => t.trip_id);
      const invoices = await this.billing.getInvoicesForTrips(opts.tenantId, tripIds);
      const expenseRows = await this.expenses.getExpensesForTrips(opts.tenantId, tripIds);

      const invoiceRows = invoices.map((inv) => ({
        freightCharge: inv.freight_charge,
        additionalCharges: inv.additional_charges,
        taxAmount: inv.tax_amount,
        amountPaid: inv.amount_paid,
        paymentStatus: inv.payment_status as InvoiceSummary["paymentStatus"],
        dueDate: inv.due_date,
      }));
      const [gross] = sumIncludedInvoices(invoiceRows);
      const recordedExpenses = sumExpenses(
        expenseRows.map((e) => ({ amount: e.amount, expenseCategory: e.expense_category })),
      );
      const profit = new Decimal(gross).minus(recordedExpenses);
      const totalDistance = trips.reduce(
        (acc, t) => (t.distance_km ? acc.plus(t.distance_km) : acc),
        new Decimal(0),
      );

      const excluded = trips.length < opts.minSampleSize;
      const perKm =
        !excluded && totalDistance.greaterThan(0)
          ? profit.dividedBy(totalDistance).toDecimalPlaces(2).toFixed(2)
          : null;

      results.push({
        origin,
        destination,
        tripCount: trips.length,
        grossBilledAmount: gross,
        recordedExpenses,
        aggregateProfit: profit.toFixed(2),
        totalDistanceKm: totalDistance.toFixed(2),
        aggregateProfitPerKm: perKm,
        excludedBelowMinSample: excluded,
      });
    }

    results.sort((a, b) => {
      if (a.aggregateProfitPerKm === null) return 1;
      if (b.aggregateProfitPerKm === null) return -1;
      return Number(b.aggregateProfitPerKm) - Number(a.aggregateProfitPerKm);
    });
    return results;
  }
}
