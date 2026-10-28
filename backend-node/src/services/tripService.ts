import type { PoolClient } from "pg";
import { BillingRepository } from "../repositories/billingRepository.js";
import { ExpenseRepository } from "../repositories/expenseRepository.js";
import { TripRepository, type ListTripsFilters } from "../repositories/tripRepository.js";
import type { TripWithJoinsRow } from "../db/types.js";
import {
  expenseBreakdown,
  grossBilledAmount,
  isOverdue,
  outstandingBalance,
  profitPerKm,
  sumExpenses,
  sumIncludedInvoices,
  tripProfit,
} from "./financials.js";
import type {
  ExpenseEntry,
  InvoiceSummary,
  TripDetail,
  TripFinancials,
  TripSummary,
} from "../schemas/domain.js";
import type { PageInfo } from "../schemas/common.js";

function rowToSummary(row: TripWithJoinsRow): TripSummary {
  return {
    tripId: row.trip_id,
    tripNumber: row.trip_number,
    lrNumber: row.lr_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    vehicleId: row.vehicle_id,
    vehicleRegistrationNo: row.vehicle_registration_no,
    driverId: row.driver_id,
    driverName: row.driver_name,
    origin: row.origin,
    destination: row.destination,
    startDate: row.start_date,
    plannedDeliveryDate: row.planned_delivery_date,
    actualDeliveryDate: row.actual_delivery_date,
    distanceKm: row.distance_km,
    tripStatus: row.trip_status as TripSummary["tripStatus"],
  };
}

export class TripService {
  private readonly trips: TripRepository;
  private readonly billing: BillingRepository;
  private readonly expenses: ExpenseRepository;

  constructor(client: PoolClient) {
    this.trips = new TripRepository(client);
    this.billing = new BillingRepository(client);
    this.expenses = new ExpenseRepository(client);
  }

  async listTrips(
    filters: ListTripsFilters,
  ): Promise<{ trips: TripSummary[]; pageInfo: PageInfo; completeness: "complete" | "partial" }> {
    const { rows, totalCount } = await this.trips.listTrips(filters);
    const summaries = rows.map(rowToSummary);
    const hasMore = filters.offset + summaries.length < totalCount;
    return {
      trips: summaries,
      pageInfo: {
        limit: filters.limit,
        offset: filters.offset,
        returnedCount: summaries.length,
        totalCount,
        hasMore,
      },
      completeness: hasMore ? "partial" : "complete",
    };
  }

  async getTripDetails(opts: {
    tenantId: string;
    tripNumber?: string;
    tripId?: string;
    customerScope?: string | null;
  }): Promise<TripDetail | null> {
    const row = await this.trips.getByNumberOrId({
      tenantId: opts.tenantId,
      tripNumber: opts.tripNumber,
      tripId: opts.tripId,
      customerId: opts.customerScope,
    });
    if (!row) return null;
    return {
      ...rowToSummary(row),
      cargoDescription: row.cargo_description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getTripFinancials(opts: {
    tenantId: string;
    tripNumber?: string;
    tripId?: string;
    asOf: string;
    customerScope?: string | null;
  }): Promise<TripFinancials | null> {
    const row = await this.trips.getByNumberOrId({
      tenantId: opts.tenantId,
      tripNumber: opts.tripNumber,
      tripId: opts.tripId,
      customerId: opts.customerScope,
    });
    if (!row) return null;

    const invoices = await this.billing.getInvoicesForTrip(opts.tenantId, row.trip_id);
    const expenseRows = await this.expenses.getExpensesForTrip({
      tenantId: opts.tenantId,
      tripId: row.trip_id,
    });

    const invoiceRows = invoices.map((inv) => ({
      freightCharge: inv.freight_charge,
      additionalCharges: inv.additional_charges,
      taxAmount: inv.tax_amount,
      amountPaid: inv.amount_paid,
      paymentStatus: inv.payment_status as InvoiceSummary["paymentStatus"],
      dueDate: inv.due_date,
    }));
    const [gross, paid, outstanding] = sumIncludedInvoices(invoiceRows);
    const recordedExpenses = sumExpenses(
      expenseRows.map((e) => ({ amount: e.amount, expenseCategory: e.expense_category })),
    );
    const breakdown = expenseBreakdown(
      expenseRows.map((e) => ({ amount: e.amount, expenseCategory: e.expense_category })),
    );

    const hasBillingData = invoices.length > 0;
    const hasExpenseData = expenseRows.length > 0;
    const notes: string[] = [];

    let profit: string | null = null;
    if (!hasBillingData) {
      notes.push("No invoice is recorded for this trip; profit cannot be calculated.");
    } else {
      profit = tripProfit(gross, recordedExpenses);
      if (!hasExpenseData) {
        notes.push(
          "No expense entries are recorded for this trip. This profit figure assumes zero " +
            "recorded expenses, which may understate true cost if expenses simply have not " +
            "been logged yet.",
        );
      }
    }

    const perKm = profitPerKm(profit, row.distance_km);
    if (profit !== null && perKm === null) {
      notes.push("distance_km is missing or not positive, so profit-per-kilometre is undefined.");
    }
    if (row.trip_status === "cancelled") {
      notes.push(
        "This trip is cancelled; figures reflect whatever billing/expenses were recorded " +
          "regardless of cancellation.",
      );
    }

    const invoiceSummaries: InvoiceSummary[] = invoices.map((inv) => ({
      billingId: inv.billing_id,
      invoiceNumber: inv.invoice_number,
      grossBilledAmount: grossBilledAmount({
        freightCharge: inv.freight_charge,
        additionalCharges: inv.additional_charges,
        taxAmount: inv.tax_amount,
        amountPaid: inv.amount_paid,
        paymentStatus: inv.payment_status as InvoiceSummary["paymentStatus"],
        dueDate: inv.due_date,
      }).toFixed(2),
      amountPaid: inv.amount_paid,
      outstandingBalance: outstandingBalance({
        freightCharge: inv.freight_charge,
        additionalCharges: inv.additional_charges,
        taxAmount: inv.tax_amount,
        amountPaid: inv.amount_paid,
        paymentStatus: inv.payment_status as InvoiceSummary["paymentStatus"],
        dueDate: inv.due_date,
      }).toFixed(2),
      dueDate: inv.due_date,
      paymentStatus: inv.payment_status as InvoiceSummary["paymentStatus"],
      isOverdue: isOverdue(
        {
          freightCharge: inv.freight_charge,
          additionalCharges: inv.additional_charges,
          taxAmount: inv.tax_amount,
          amountPaid: inv.amount_paid,
          paymentStatus: inv.payment_status as InvoiceSummary["paymentStatus"],
          dueDate: inv.due_date,
        },
        opts.asOf,
      ),
    }));

    return {
      tripId: row.trip_id,
      tripNumber: row.trip_number,
      invoices: invoiceSummaries,
      grossBilledAmount: gross,
      amountPaid: paid,
      outstandingBalance: outstanding,
      recordedExpenses,
      expenseBreakdown: breakdown,
      tripProfit: profit,
      profitPerKm: perKm,
      distanceKm: row.distance_km,
      hasBillingData,
      hasExpenseData,
      notes,
    };
  }

  async getTripExpenses(opts: {
    tenantId: string;
    tripNumber?: string;
    tripId?: string;
    expenseCategory?: string;
    startDate?: string;
    endDate?: string;
    customerScope?: string | null;
  }): Promise<{ tripId: string; expenses: ExpenseEntry[]; breakdown: Record<string, string>; total: string } | null> {
    const row = await this.trips.getByNumberOrId({
      tenantId: opts.tenantId,
      tripNumber: opts.tripNumber,
      tripId: opts.tripId,
      customerId: opts.customerScope,
    });
    if (!row) return null;

    const expenseRows = await this.expenses.getExpensesForTrip({
      tenantId: opts.tenantId,
      tripId: row.trip_id,
      expenseCategory: opts.expenseCategory,
      startDate: opts.startDate,
      endDate: opts.endDate,
    });
    const entries: ExpenseEntry[] = expenseRows.map((e) => ({
      expenseId: e.expense_id,
      expenseCategory: e.expense_category as ExpenseEntry["expenseCategory"],
      amount: e.amount,
      expenseDate: e.expense_date,
      description: e.description,
    }));
    const plain = expenseRows.map((e) => ({ amount: e.amount, expenseCategory: e.expense_category }));
    return {
      tripId: row.trip_id,
      expenses: entries,
      breakdown: expenseBreakdown(plain),
      total: sumExpenses(plain),
    };
  }
}
