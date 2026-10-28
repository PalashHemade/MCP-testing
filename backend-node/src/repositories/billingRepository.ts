import type { PoolClient } from "pg";
import type { TripBillingRow } from "../db/types.js";

export interface UnpaidInvoiceJoinRow extends TripBillingRow {
  trip_number: string;
  customer_id: string;
  customer_name: string;
}

export class BillingRepository {
  constructor(private readonly client: PoolClient) {}

  async getInvoicesForTrip(tenantId: string, tripId: string): Promise<TripBillingRow[]> {
    const result = await this.client.query<TripBillingRow>(
      "SELECT * FROM trip_billing WHERE tenant_id = $1 AND trip_id = $2 ORDER BY invoice_date",
      [tenantId, tripId],
    );
    return result.rows;
  }

  async getInvoicesForTrips(tenantId: string, tripIds: string[]): Promise<TripBillingRow[]> {
    if (tripIds.length === 0) return [];
    const result = await this.client.query<TripBillingRow>(
      "SELECT * FROM trip_billing WHERE tenant_id = $1 AND trip_id = ANY($2)",
      [tenantId, tripIds],
    );
    return result.rows;
  }

  async listUnpaidInvoices(opts: {
    tenantId: string;
    startDate?: string;
    endDate?: string;
    paymentStatus?: string;
    customerId?: string | null;
    limit: number;
    offset: number;
  }): Promise<{ rows: UnpaidInvoiceJoinRow[]; totalCount: number }> {
    const statuses = opts.paymentStatus ? [opts.paymentStatus] : ["unpaid", "partially_paid"];
    const conditions = ["b.tenant_id = $1", "b.payment_status = ANY($2)"];
    const params: unknown[] = [opts.tenantId, statuses];

    if (opts.startDate) {
      params.push(opts.startDate);
      conditions.push(`b.invoice_date >= $${params.length}`);
    }
    if (opts.endDate) {
      params.push(opts.endDate);
      conditions.push(`b.invoice_date <= $${params.length}`);
    }
    if (opts.customerId) {
      params.push(opts.customerId);
      conditions.push(`t.customer_id = $${params.length}`);
    }

    const whereClause = conditions.join(" AND ");
    const joinClause = `
      FROM trip_billing b
      JOIN trips t ON t.tenant_id = b.tenant_id AND t.trip_id = b.trip_id
      JOIN customers c ON c.tenant_id = t.tenant_id AND c.customer_id = t.customer_id
    `;

    const countResult = await this.client.query<{ count: string }>(
      `SELECT count(*) ${joinClause} WHERE ${whereClause}`,
      params,
    );
    const totalCount = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);

    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;
    const rows = await this.client.query<UnpaidInvoiceJoinRow>(
      `SELECT b.*, t.trip_number, c.customer_id, c.customer_name ${joinClause} WHERE ${whereClause} ` +
        `ORDER BY b.due_date ASC NULLS LAST LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, opts.limit, opts.offset],
    );

    return { rows: rows.rows, totalCount };
  }
}
