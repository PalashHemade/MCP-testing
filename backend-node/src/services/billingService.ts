import type { PoolClient } from "pg";
import { BillingRepository } from "../repositories/billingRepository.js";
import { grossBilledAmount, isOverdue, outstandingBalance } from "./financials.js";
import type { InvoiceSummary } from "../schemas/domain.js";
import type { PageInfo } from "../schemas/common.js";

export interface UnpaidInvoiceRow {
  billingId: string;
  invoiceNumber: string;
  tripId: string;
  tripNumber: string;
  customerId: string;
  customerName: string;
  grossBilledAmount: string;
  amountPaid: string;
  outstandingBalance: string;
  dueDate: string | null;
  paymentStatus: InvoiceSummary["paymentStatus"];
  isOverdue: boolean;
}

export class BillingService {
  private readonly billing: BillingRepository;

  constructor(client: PoolClient) {
    this.billing = new BillingRepository(client);
  }

  async listUnpaidInvoices(opts: {
    tenantId: string;
    startDate?: string;
    endDate?: string;
    paymentStatus?: string;
    customerScope?: string | null;
    limit: number;
    offset: number;
    asOf: string;
  }): Promise<{ invoices: UnpaidInvoiceRow[]; pageInfo: PageInfo; completeness: "complete" | "partial" }> {
    const { rows, totalCount } = await this.billing.listUnpaidInvoices({
      tenantId: opts.tenantId,
      startDate: opts.startDate,
      endDate: opts.endDate,
      paymentStatus: opts.paymentStatus,
      customerId: opts.customerScope,
      limit: opts.limit,
      offset: opts.offset,
    });

    const invoices: UnpaidInvoiceRow[] = rows.map((row) => {
      const asInvoice = {
        freightCharge: row.freight_charge,
        additionalCharges: row.additional_charges,
        taxAmount: row.tax_amount,
        amountPaid: row.amount_paid,
        paymentStatus: row.payment_status as InvoiceSummary["paymentStatus"],
        dueDate: row.due_date,
      };
      return {
        billingId: row.billing_id,
        invoiceNumber: row.invoice_number,
        tripId: row.trip_id,
        tripNumber: row.trip_number,
        customerId: row.customer_id,
        customerName: row.customer_name,
        grossBilledAmount: grossBilledAmount(asInvoice).toFixed(2),
        amountPaid: row.amount_paid,
        outstandingBalance: outstandingBalance(asInvoice).toFixed(2),
        dueDate: row.due_date,
        paymentStatus: asInvoice.paymentStatus,
        isOverdue: isOverdue(asInvoice, opts.asOf),
      };
    });

    const hasMore = opts.offset + invoices.length < totalCount;
    return {
      invoices,
      pageInfo: {
        limit: opts.limit,
        offset: opts.offset,
        returnedCount: invoices.length,
        totalCount,
        hasMore,
      },
      completeness: hasMore ? "partial" : "complete",
    };
  }
}
