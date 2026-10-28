import { z } from "zod";
import { CompletenessStatus, PageInfoSchema, validateDateRange } from "./common.js";
import {
  DocumentPassageSchema,
  DocumentType,
  DriverBriefSchema,
  ExpenseEntrySchema,
  ExpenseCategory,
  PaymentStatus,
  TripDetailSchema,
  TripFinancialsSchema,
  TripStatus,
  TripSummarySchema,
} from "./domain.js";

// ---- Tool 1: list_trips --------------------------------------------------
export const ListTripsInput = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    tripStatus: TripStatus.optional(),
    customerId: z.string().optional(),
    vehicleId: z.string().optional(),
    driverId: z.string().optional(),
    origin: z.string().optional(),
    destination: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .superRefine(validateDateRange);
export type ListTripsInput = z.infer<typeof ListTripsInput>;

export const ListTripsOutput = z.object({
  trips: z.array(TripSummarySchema),
  appliedFilters: z.record(z.string(), z.unknown()),
  pageInfo: PageInfoSchema,
  completeness: CompletenessStatus,
});
export type ListTripsOutput = z.infer<typeof ListTripsOutput>;

// ---- Tool 2: get_trip_details ---------------------------------------------
export const GetTripDetailsInput = z
  .object({ tripNumber: z.string().optional(), tripId: z.string().optional() })
  .superRefine((data, ctx) => {
    if (!data.tripNumber && !data.tripId) {
      ctx.addIssue({ code: "custom", message: "one of tripNumber or tripId is required" });
    }
  });
export type GetTripDetailsInput = z.infer<typeof GetTripDetailsInput>;

export const GetTripDetailsOutput = z.object({
  found: z.boolean(),
  trip: TripDetailSchema.nullable(),
  completeness: CompletenessStatus,
});
export type GetTripDetailsOutput = z.infer<typeof GetTripDetailsOutput>;

// ---- Tool 3: get_trip_financials -------------------------------------------
export const GetTripFinancialsInput = GetTripDetailsInput;
export type GetTripFinancialsInput = z.infer<typeof GetTripFinancialsInput>;

export const GetTripFinancialsOutput = z.object({
  found: z.boolean(),
  financials: TripFinancialsSchema.nullable(),
  completeness: CompletenessStatus,
});
export type GetTripFinancialsOutput = z.infer<typeof GetTripFinancialsOutput>;

// ---- Tool 4: get_trip_expenses ---------------------------------------------
export const GetTripExpensesInput = z
  .object({
    tripNumber: z.string().optional(),
    tripId: z.string().optional(),
    expenseCategory: ExpenseCategory.optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.tripNumber && !data.tripId) {
      ctx.addIssue({ code: "custom", message: "one of tripNumber or tripId is required" });
    }
    validateDateRange(data, ctx);
  });
export type GetTripExpensesInput = z.infer<typeof GetTripExpensesInput>;

export const GetTripExpensesOutput = z.object({
  found: z.boolean(),
  tripId: z.string().nullable(),
  expenses: z.array(ExpenseEntrySchema),
  categoryBreakdown: z.record(z.string(), z.string()),
  totalRecordedExpenses: z.string(),
  appliedFilters: z.record(z.string(), z.unknown()),
  completeness: CompletenessStatus,
});
export type GetTripExpensesOutput = z.infer<typeof GetTripExpensesOutput>;

// ---- Tool 5: get_customer_trip_summary -------------------------------------
export const GetCustomerTripSummaryInput = z
  .object({
    customerId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .superRefine(validateDateRange);
export type GetCustomerTripSummaryInput = z.infer<typeof GetCustomerTripSummaryInput>;

export const CustomerTripSummaryResultSchema = z.object({
  customerId: z.string(),
  customerName: z.string(),
  tripCount: z.number().int(),
  completedCount: z.number().int(),
  inTransitCount: z.number().int(),
  cancelledCount: z.number().int(),
  grossBilledAmount: z.string(),
  amountPaid: z.string(),
  outstandingBalance: z.string(),
  recordedExpenses: z.string(),
  tripProfit: z.string().nullable(),
});

export const GetCustomerTripSummaryOutput = z.object({
  results: z.array(CustomerTripSummaryResultSchema),
  appliedFilters: z.record(z.string(), z.unknown()),
  completeness: CompletenessStatus,
});
export type GetCustomerTripSummaryOutput = z.infer<typeof GetCustomerTripSummaryOutput>;

// ---- Tool 6: list_unpaid_invoices -------------------------------------------
export const ListUnpaidInvoicesInput = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    paymentStatus: PaymentStatus.optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .superRefine(validateDateRange);
export type ListUnpaidInvoicesInput = z.infer<typeof ListUnpaidInvoicesInput>;

export const UnpaidInvoiceRowSchema = z.object({
  billingId: z.string(),
  invoiceNumber: z.string(),
  tripId: z.string(),
  tripNumber: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  grossBilledAmount: z.string(),
  amountPaid: z.string(),
  outstandingBalance: z.string(),
  dueDate: z.string().nullable(),
  paymentStatus: PaymentStatus,
  isOverdue: z.boolean(),
});

export const ListUnpaidInvoicesOutput = z.object({
  invoices: z.array(UnpaidInvoiceRowSchema),
  appliedFilters: z.record(z.string(), z.unknown()),
  pageInfo: PageInfoSchema,
  completeness: CompletenessStatus,
});
export type ListUnpaidInvoicesOutput = z.infer<typeof ListUnpaidInvoicesOutput>;

// ---- Tool 7: get_vehicle_utilization (operator-only) -----------------------
export const GetVehicleUtilizationInput = z
  .object({
    vehicleId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .superRefine(validateDateRange);
export type GetVehicleUtilizationInput = z.infer<typeof GetVehicleUtilizationInput>;

export const VehicleUtilizationResultSchema = z.object({
  vehicleId: z.string(),
  registrationNo: z.string(),
  vehicleType: z.string(),
  tripCount: z.number().int(),
  completedTripCount: z.number().int(),
  inTransitTripCount: z.number().int(),
  totalRecordedDistanceKm: z.string(),
});

export const GetVehicleUtilizationOutput = z.object({
  results: z.array(VehicleUtilizationResultSchema),
  appliedFilters: z.record(z.string(), z.unknown()),
  completeness: CompletenessStatus,
});
export type GetVehicleUtilizationOutput = z.infer<typeof GetVehicleUtilizationOutput>;

// ---- Tool 8: get_driver_trip_history (operator-only) -----------------------
export const GetDriverTripHistoryInput = z
  .object({
    driverId: z.string().optional(),
    driverName: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    if (!data.driverId && !data.driverName) {
      ctx.addIssue({ code: "custom", message: "one of driverId or driverName is required" });
    }
    validateDateRange(data, ctx);
  });
export type GetDriverTripHistoryInput = z.infer<typeof GetDriverTripHistoryInput>;

export const GetDriverTripHistoryOutput = z.object({
  ambiguous: z.boolean(),
  matchingDrivers: z.array(DriverBriefSchema),
  driver: DriverBriefSchema.nullable(),
  trips: z.array(TripSummarySchema),
  tripCount: z.number().int(),
  totalRecordedDistanceKm: z.string(),
  pageInfo: PageInfoSchema.nullable(),
  completeness: CompletenessStatus,
});
export type GetDriverTripHistoryOutput = z.infer<typeof GetDriverTripHistoryOutput>;

// ---- Tool 9: compare_route_profitability (operator-only) -------------------
export const CompareRouteProfitabilityInput = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    origin: z.string().optional(),
    destination: z.string().optional(),
    minSampleSize: z.number().int().min(1).default(1),
  })
  .superRefine(validateDateRange);
export type CompareRouteProfitabilityInput = z.infer<typeof CompareRouteProfitabilityInput>;

export const RouteProfitabilityResultSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  tripCount: z.number().int(),
  grossBilledAmount: z.string(),
  recordedExpenses: z.string(),
  aggregateProfit: z.string(),
  totalDistanceKm: z.string(),
  aggregateProfitPerKm: z.string().nullable(),
  excludedBelowMinSample: z.boolean(),
});

export const CompareRouteProfitabilityOutput = z.object({
  results: z.array(RouteProfitabilityResultSchema),
  appliedFilters: z.record(z.string(), z.unknown()),
  completeness: CompletenessStatus,
  directionalityNote: z.string().default(
    "Routes are directional: origin -> destination is grouped separately from destination -> origin.",
  ),
  metricNote: z.string().default(
    "aggregateProfitPerKm = sum(trip profit) / sum(trip distance_km) across all trips in the route group - this is NOT the average of each trip's individual profit-per-km ratio.",
  ),
});
export type CompareRouteProfitabilityOutput = z.infer<typeof CompareRouteProfitabilityOutput>;

// ---- Tool 10: search_logistics_documents -----------------------------------
export const SearchLogisticsDocumentsInput = z.object({
  query: z.string().min(1).max(2000),
  documentType: DocumentType.optional(),
  jurisdiction: z.string().optional(),
  effectiveDate: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(5),
});
export type SearchLogisticsDocumentsInput = z.infer<typeof SearchLogisticsDocumentsInput>;

export const SearchLogisticsDocumentsOutput = z.object({
  passages: z.array(DocumentPassageSchema),
  appliedFilters: z.record(z.string(), z.unknown()),
  retrievalMethod: z.string(),
  foundRelevantResults: z.boolean(),
  completeness: CompletenessStatus,
});
export type SearchLogisticsDocumentsOutput = z.infer<typeof SearchLogisticsDocumentsOutput>;
