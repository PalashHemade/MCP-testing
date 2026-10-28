import type { PoolClient } from "pg";
import { BillingRepository } from "../repositories/billingRepository.js";
import { CustomerRepository } from "../repositories/customerRepository.js";
import { ExpenseRepository } from "../repositories/expenseRepository.js";
import { TripRepository } from "../repositories/tripRepository.js";
import { sumExpenses, sumIncludedInvoices, tripProfit } from "./financials.js";
import type { InvoiceSummary } from "../schemas/domain.js";

export interface CustomerTripSummaryResult {
  customerId: string;
  customerName: string;
  tripCount: number;
  completedCount: number;
  inTransitCount: number;
  cancelledCount: number;
  grossBilledAmount: string;
  amountPaid: string;
  outstandingBalance: string;
  recordedExpenses: string;
  tripProfit: string | null;
}

export class CustomerService {
  private readonly trips: TripRepository;
  private readonly billing: BillingRepository;
  private readonly expenses: ExpenseRepository;
  private readonly customers: CustomerRepository;

  constructor(client: PoolClient) {
    this.trips = new TripRepository(client);
    this.billing = new BillingRepository(client);
    this.expenses = new ExpenseRepository(client);
    this.customers = new CustomerRepository(client);
  }

  async getCustomerTripSummary(opts: {
    tenantId: string;
    customerId?: string | null;
    startDate?: string;
    endDate?: string;
  }): Promise<CustomerTripSummaryResult[]> {
    const customers = opts.customerId
      ? [await this.customers.get(opts.tenantId, opts.customerId)].filter((c) => c !== null)
      : await this.customers.listForTenant(opts.tenantId);

    const results: CustomerTripSummaryResult[] = [];
    for (const customer of customers) {
      const { rows } = await this.trips.listTrips({
        tenantId: opts.tenantId,
        customerId: customer.customer_id,
        startDate: opts.startDate,
        endDate: opts.endDate,
        limit: 500,
        offset: 0,
      });

      if (rows.length === 0) {
        results.push({
          customerId: customer.customer_id,
          customerName: customer.customer_name,
          tripCount: 0,
          completedCount: 0,
          inTransitCount: 0,
          cancelledCount: 0,
          grossBilledAmount: "0.00",
          amountPaid: "0.00",
          outstandingBalance: "0.00",
          recordedExpenses: "0.00",
          tripProfit: null,
        });
        continue;
      }

      const tripIds = rows.map((r) => r.trip_id);
      const completed = rows.filter((r) => r.trip_status === "completed").length;
      const inTransit = rows.filter((r) => r.trip_status === "in_transit").length;
      const cancelled = rows.filter((r) => r.trip_status === "cancelled").length;

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
      const [gross, paid, outstanding] = sumIncludedInvoices(invoiceRows);
      const recordedExpenses = sumExpenses(
        expenseRows.map((e) => ({ amount: e.amount, expenseCategory: e.expense_category })),
      );
      const profit = invoices.length > 0 ? tripProfit(gross, recordedExpenses) : null;

      results.push({
        customerId: customer.customer_id,
        customerName: customer.customer_name,
        tripCount: tripIds.length,
        completedCount: completed,
        inTransitCount: inTransit,
        cancelledCount: cancelled,
        grossBilledAmount: gross,
        amountPaid: paid,
        outstandingBalance: outstanding,
        recordedExpenses,
        tripProfit: profit,
      });
    }
    return results;
  }
}
