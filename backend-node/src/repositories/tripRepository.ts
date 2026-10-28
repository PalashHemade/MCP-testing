import type { PoolClient } from "pg";
import type { TripWithJoinsRow } from "../db/types.js";

export interface ListTripsFilters {
  tenantId: string;
  startDate?: string;
  endDate?: string;
  tripStatus?: string;
  customerId?: string | null;
  vehicleId?: string;
  driverId?: string;
  origin?: string;
  destination?: string;
  limit: number;
  offset: number;
}

const BASE_SELECT = `
  SELECT t.*, c.customer_name, v.registration_no AS vehicle_registration_no, d.driver_name
  FROM trips t
  JOIN customers c ON c.tenant_id = t.tenant_id AND c.customer_id = t.customer_id
  JOIN vehicles v ON v.tenant_id = t.tenant_id AND v.vehicle_id = t.vehicle_id
  JOIN drivers d ON d.tenant_id = t.tenant_id AND d.driver_id = t.driver_id
`;

export class TripRepository {
  constructor(private readonly client: PoolClient) {}

  async listTrips(filters: ListTripsFilters): Promise<{ rows: TripWithJoinsRow[]; totalCount: number }> {
    const conditions: string[] = ["t.tenant_id = $1"];
    const params: unknown[] = [filters.tenantId];

    const push = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace("?", `$${params.length}`));
    };

    if (filters.startDate) push("t.start_date >= ?", filters.startDate);
    if (filters.endDate) push("t.start_date <= ?", filters.endDate);
    if (filters.tripStatus) push("t.trip_status = ?", filters.tripStatus);
    if (filters.customerId) push("t.customer_id = ?", filters.customerId);
    if (filters.vehicleId) push("t.vehicle_id = ?", filters.vehicleId);
    if (filters.driverId) push("t.driver_id = ?", filters.driverId);
    if (filters.origin) push("t.origin ILIKE ?", `%${filters.origin}%`);
    if (filters.destination) push("t.destination ILIKE ?", `%${filters.destination}%`);

    const whereClause = conditions.join(" AND ");

    const countResult = await this.client.query<{ count: string }>(
      `SELECT count(*) FROM trips t WHERE ${whereClause}`,
      params,
    );
    const totalCount = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);

    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;
    const rows = await this.client.query<TripWithJoinsRow>(
      `${BASE_SELECT} WHERE ${whereClause} ORDER BY t.start_date DESC, t.trip_number LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, filters.limit, filters.offset],
    );

    return { rows: rows.rows, totalCount };
  }

  async getByNumberOrId(opts: {
    tenantId: string;
    tripNumber?: string;
    tripId?: string;
    customerId?: string | null;
  }): Promise<TripWithJoinsRow | null> {
    const conditions = ["t.tenant_id = $1"];
    const params: unknown[] = [opts.tenantId];

    if (opts.customerId) {
      params.push(opts.customerId);
      conditions.push(`t.customer_id = $${params.length}`);
    }
    if (opts.tripId) {
      params.push(opts.tripId);
      conditions.push(`t.trip_id = $${params.length}`);
    } else if (opts.tripNumber) {
      params.push(opts.tripNumber);
      conditions.push(`t.trip_number = $${params.length}`);
    } else {
      return null;
    }

    const result = await this.client.query<TripWithJoinsRow>(
      `${BASE_SELECT} WHERE ${conditions.join(" AND ")}`,
      params,
    );
    return result.rows[0] ?? null;
  }
}
