import type { PoolClient } from "pg";
import type { DriverRow, TripRow } from "../db/types.js";

export class DriverRepository {
  constructor(private readonly client: PoolClient) {}

  async get(tenantId: string, driverId: string): Promise<DriverRow | null> {
    const result = await this.client.query<DriverRow>(
      "SELECT * FROM drivers WHERE tenant_id = $1 AND driver_id = $2",
      [tenantId, driverId],
    );
    return result.rows[0] ?? null;
  }

  async findByName(tenantId: string, driverName: string): Promise<DriverRow[]> {
    const result = await this.client.query<DriverRow>(
      "SELECT * FROM drivers WHERE tenant_id = $1 AND driver_name ILIKE $2",
      [tenantId, `%${driverName}%`],
    );
    return result.rows;
  }

  async getTripsForDriver(opts: {
    tenantId: string;
    driverId: string;
    startDate?: string;
    endDate?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: TripRow[]; totalCount: number }> {
    const conditions = ["tenant_id = $1", "driver_id = $2"];
    const params: unknown[] = [opts.tenantId, opts.driverId];
    if (opts.startDate) {
      params.push(opts.startDate);
      conditions.push(`start_date >= $${params.length}`);
    }
    if (opts.endDate) {
      params.push(opts.endDate);
      conditions.push(`start_date <= $${params.length}`);
    }
    const whereClause = conditions.join(" AND ");

    const countResult = await this.client.query<{ count: string }>(
      `SELECT count(*) FROM trips WHERE ${whereClause}`,
      params,
    );
    const totalCount = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);

    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;
    const rows = await this.client.query<TripRow>(
      `SELECT * FROM trips WHERE ${whereClause} ORDER BY start_date DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, opts.limit, opts.offset],
    );
    return { rows: rows.rows, totalCount };
  }
}
