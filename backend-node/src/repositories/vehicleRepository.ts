import type { PoolClient } from "pg";
import type { TripRow, VehicleRow } from "../db/types.js";

export class VehicleRepository {
  constructor(private readonly client: PoolClient) {}

  async listForTenant(tenantId: string, vehicleId?: string): Promise<VehicleRow[]> {
    const conditions = ["tenant_id = $1"];
    const params: unknown[] = [tenantId];
    if (vehicleId) {
      params.push(vehicleId);
      conditions.push(`vehicle_id = $${params.length}`);
    }
    const result = await this.client.query<VehicleRow>(
      `SELECT * FROM vehicles WHERE ${conditions.join(" AND ")} ORDER BY registration_no`,
      params,
    );
    return result.rows;
  }

  async getTripsForVehicle(opts: {
    tenantId: string;
    vehicleId: string;
    startDate?: string;
    endDate?: string;
  }): Promise<TripRow[]> {
    const conditions = ["tenant_id = $1", "vehicle_id = $2"];
    const params: unknown[] = [opts.tenantId, opts.vehicleId];
    if (opts.startDate) {
      params.push(opts.startDate);
      conditions.push(`start_date >= $${params.length}`);
    }
    if (opts.endDate) {
      params.push(opts.endDate);
      conditions.push(`start_date <= $${params.length}`);
    }
    const result = await this.client.query<TripRow>(
      `SELECT * FROM trips WHERE ${conditions.join(" AND ")}`,
      params,
    );
    return result.rows;
  }
}
