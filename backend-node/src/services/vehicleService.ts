import type { PoolClient } from "pg";
import { Decimal } from "decimal.js";
import { VehicleRepository } from "../repositories/vehicleRepository.js";

export interface VehicleUtilizationResult {
  vehicleId: string;
  registrationNo: string;
  vehicleType: string;
  tripCount: number;
  completedTripCount: number;
  inTransitTripCount: number;
  totalRecordedDistanceKm: string;
}

export class VehicleService {
  private readonly vehicles: VehicleRepository;

  constructor(client: PoolClient) {
    this.vehicles = new VehicleRepository(client);
  }

  async getVehicleUtilization(opts: {
    tenantId: string;
    vehicleId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<VehicleUtilizationResult[]> {
    const vehicles = await this.vehicles.listForTenant(opts.tenantId, opts.vehicleId);
    const results: VehicleUtilizationResult[] = [];
    for (const vehicle of vehicles) {
      const trips = await this.vehicles.getTripsForVehicle({
        tenantId: opts.tenantId,
        vehicleId: vehicle.vehicle_id,
        startDate: opts.startDate,
        endDate: opts.endDate,
      });
      const completed = trips.filter((t) => t.trip_status === "completed").length;
      const inTransit = trips.filter((t) => t.trip_status === "in_transit").length;
      const totalDistance = trips.reduce(
        (acc, t) => (t.distance_km ? acc.plus(t.distance_km) : acc),
        new Decimal(0),
      );
      results.push({
        vehicleId: vehicle.vehicle_id,
        registrationNo: vehicle.registration_no,
        vehicleType: vehicle.vehicle_type,
        tripCount: trips.length,
        completedTripCount: completed,
        inTransitTripCount: inTransit,
        totalRecordedDistanceKm: totalDistance.toFixed(2),
      });
    }
    return results;
  }
}
