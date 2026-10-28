/** Business-metric calculations shared by every service/tool that
 * touches money. This is the SINGLE implementation of the financial
 * definitions - nothing else re-derives these numbers independently.
 * Direct port of the Python backend's app/services/financials.py.
 *
 * Invoice inclusion rule: aggregates only include invoices whose
 * payment_status is one of {unpaid, partially_paid, paid}. 'draft'
 * (not yet finalized) and 'cancelled' (voided) invoices are excluded
 * from revenue/profit, but still returned in get_trip_financials for
 * transparency.
 *
 * Decimal safety: Postgres NUMERIC columns come back from `pg` as
 * strings (to avoid silent float precision loss) - all arithmetic here
 * goes through decimal.js rather than native number.
 */
import { Decimal } from "decimal.js";
import type { PaymentStatus } from "../schemas/domain.js";

export interface InvoiceRow {
  freightCharge: string;
  additionalCharges: string;
  taxAmount: string;
  amountPaid: string;
  paymentStatus: PaymentStatus;
  dueDate: string | null;
}

export interface ExpenseRow {
  amount: string;
  expenseCategory: string;
}

const INCLUDED_INVOICE_STATUSES = new Set<PaymentStatus>(["unpaid", "partially_paid", "paid"]);

function q(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function grossBilledAmount(invoice: InvoiceRow): Decimal {
  return new Decimal(invoice.freightCharge)
    .plus(invoice.additionalCharges)
    .plus(invoice.taxAmount);
}

export function outstandingBalance(invoice: InvoiceRow): Decimal {
  return grossBilledAmount(invoice).minus(invoice.amountPaid);
}

export function isOverdue(invoice: InvoiceRow, asOf: string): boolean {
  if (!invoice.dueDate) return false;
  if (invoice.paymentStatus === "paid" || invoice.paymentStatus === "cancelled" || invoice.paymentStatus === "draft") {
    return false;
  }
  return invoice.dueDate < asOf && outstandingBalance(invoice).greaterThan(0);
}

/** Returns [grossBilledAmount, amountPaid, outstandingBalance] as
 * formatted 2-decimal strings, summed only over included invoices. */
export function sumIncludedInvoices(invoices: InvoiceRow[]): [string, string, string] {
  let gross = new Decimal(0);
  let paid = new Decimal(0);
  for (const inv of invoices) {
    if (!INCLUDED_INVOICE_STATUSES.has(inv.paymentStatus)) continue;
    gross = gross.plus(grossBilledAmount(inv));
    paid = paid.plus(inv.amountPaid);
  }
  return [q(gross), q(paid), q(gross.minus(paid))];
}

export function sumExpenses(expenses: ExpenseRow[]): string {
  const total = expenses.reduce((acc, e) => acc.plus(e.amount), new Decimal(0));
  return q(total);
}

export function expenseBreakdown(expenses: ExpenseRow[]): Record<string, string> {
  const breakdown: Record<string, Decimal> = {};
  for (const e of expenses) {
    breakdown[e.expenseCategory] = (breakdown[e.expenseCategory] ?? new Decimal(0)).plus(e.amount);
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(breakdown)) {
    out[key] = q(value);
  }
  return out;
}

export function tripProfit(grossBilled: string, recordedExpenses: string): string {
  return q(new Decimal(grossBilled).minus(recordedExpenses));
}

/** None (null) when distance is missing or not strictly positive - never
 * divides by zero and never fabricates a ratio for undefined cases. */
export function profitPerKm(profit: string | null, distanceKm: string | null): string | null {
  if (profit === null || distanceKm === null) return null;
  const distance = new Decimal(distanceKm);
  if (distance.lessThanOrEqualTo(0)) return null;
  return q(new Decimal(profit).dividedBy(distance));
}
