import type { PoolClient } from "pg";
import { Decimal } from "decimal.js";
import { DriverRepository } from "../repositories/driverRepository.js";
import type { DriverRow, TripRow } from "../db/types.js";
import type { DriverBrief, TripSummary } from "../schemas/domain.js";
import type { PageInfo } from "../schemas/common.js";

function brief(d: DriverRow): DriverBrief {
  return {
    driverId: d.driver_id,
    driverName: d.driver_name,
    driverStatus: d.driver_status as DriverBrief["driverStatus"],
  };
}

function toSummary(t: TripRow, driverName: string): TripSummary {
  return {
    tripId: t.trip_id,
    tripNumber: t.trip_number,
    lrNumber: t.lr_number,
    customerId: t.customer_id,
    customerName: "", // not joined here - driver history is operator-only and intentionally lean
    vehicleId: t.vehicle_id,
    vehicleRegistrationNo: "",
    driverId: t.driver_id,
    driverName,
    origin: t.origin,
    destination: t.destination,
    startDate: t.start_date,
    plannedDeliveryDate: t.planned_delivery_date,
    actualDeliveryDate: t.actual_delivery_date,
    distanceKm: t.distance_km,
    tripStatus: t.trip_status as TripSummary["tripStatus"],
  };
}

export interface DriverTripHistoryResult {
  ambiguous: boolean;
  matchingDrivers: DriverBrief[];
  driver: DriverBrief | null;
  trips: TripSummary[];
  totalRecordedDistanceKm: string;
  pageInfo: PageInfo | null;
  completeness: "complete" | "partial" | "unknown";
}

export class DriverService {
  private readonly drivers: DriverRepository;

  constructor(client: PoolClient) {
    this.drivers = new DriverRepository(client);
  }

  async getDriverTripHistory(opts: {
    tenantId: string;
    driverId?: string;
    driverName?: string;
    startDate?: string;
    endDate?: string;
    limit: number;
    offset: number;
  }): Promise<DriverTripHistoryResult> {
    let resolvedDriverId = opts.driverId;

    if (!resolvedDriverId && opts.driverName) {
      const matches = await this.drivers.findByName(opts.tenantId, opts.driverName);
      if (matches.length > 1) {
        return {
          ambiguous: true,
          matchingDrivers: matches.map(brief),
          driver: null,
          trips: [],
          totalRecordedDistanceKm: "0.00",
          pageInfo: null,
          completeness: "unknown",
        };
      }
      if (matches.length === 1) resolvedDriverId = matches[0]!.driver_id;
    }

    if (!resolvedDriverId) {
      return {
        ambiguous: false,
        matchingDrivers: [],
        driver: null,
        trips: [],
        totalRecordedDistanceKm: "0.00",
        pageInfo: null,
        completeness: "unknown",
      };
    }

    const driver = await this.drivers.get(opts.tenantId, resolvedDriverId);
    if (!driver) {
      return {
        ambiguous: false,
        matchingDrivers: [],
        driver: null,
        trips: [],
        totalRecordedDistanceKm: "0.00",
        pageInfo: null,
        completeness: "unknown",
      };
    }

    const { rows, totalCount } = await this.drivers.getTripsForDriver({
      tenantId: opts.tenantId,
      driverId: resolvedDriverId,
      startDate: opts.startDate,
      endDate: opts.endDate,
      limit: opts.limit,
      offset: opts.offset,
    });
    const totalDistance = rows.reduce(
      (acc, t) => (t.distance_km ? acc.plus(t.distance_km) : acc),
      new Decimal(0),
    );
    const hasMore = opts.offset + rows.length < totalCount;

    return {
      ambiguous: false,
      matchingDrivers: [],
      driver: brief(driver),
      trips: rows.map((t) => toSummary(t, driver.driver_name)),
      totalRecordedDistanceKm: totalDistance.toFixed(2),
      pageInfo: {
        limit: opts.limit,
        offset: opts.offset,
        returnedCount: rows.length,
        totalCount,
        hasMore,
      },
      completeness: hasMore ? "partial" : "complete",
    };
  }
}
