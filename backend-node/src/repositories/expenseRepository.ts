import type { PoolClient } from "pg";
import type { TripExpenseRow } from "../db/types.js";

export class ExpenseRepository {
  constructor(private readonly client: PoolClient) {}

  async getExpensesForTrip(opts: {
    tenantId: string;
    tripId: string;
    expenseCategory?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<TripExpenseRow[]> {
    const conditions = ["tenant_id = $1", "trip_id = $2"];
    const params: unknown[] = [opts.tenantId, opts.tripId];

    if (opts.expenseCategory) {
      params.push(opts.expenseCategory);
      conditions.push(`expense_category = $${params.length}`);
    }
    if (opts.startDate) {
      params.push(opts.startDate);
      conditions.push(`expense_date >= $${params.length}`);
    }
    if (opts.endDate) {
      params.push(opts.endDate);
      conditions.push(`expense_date <= $${params.length}`);
    }

    const result = await this.client.query<TripExpenseRow>(
      `SELECT * FROM trip_expenses WHERE ${conditions.join(" AND ")} ORDER BY expense_date`,
      params,
    );
    return result.rows;
  }

  async getExpensesForTrips(tenantId: string, tripIds: string[]): Promise<TripExpenseRow[]> {
    if (tripIds.length === 0) return [];
    const result = await this.client.query<TripExpenseRow>(
      "SELECT * FROM trip_expenses WHERE tenant_id = $1 AND trip_id = ANY($2)",
      [tenantId, tripIds],
    );
    return result.rows;
  }
}
