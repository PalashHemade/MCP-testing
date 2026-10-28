import { z } from "zod";

export const TripStatus = z.enum(["planned", "in_transit", "completed", "cancelled"]);
export type TripStatus = z.infer<typeof TripStatus>;

export const VehicleStatus = z.enum(["active", "maintenance", "inactive"]);
export const DriverStatus = z.enum(["active", "inactive"]);
export const PaymentStatus = z.enum(["unpaid", "partially_paid", "paid", "draft", "cancelled"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;
export const ExpenseCategory = z.enum(["fuel", "toll", "loading", "allowance", "maintenance", "other"]);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;
export const DocumentType = z.enum(["policy", "port_regulation", "procedure", "other"]);
export type DocumentType = z.infer<typeof DocumentType>;

export const TripSummarySchema = z.object({
  tripId: z.string(),
  tripNumber: z.string(),
  lrNumber: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  vehicleId: z.string(),
  vehicleRegistrationNo: z.string(),
  driverId: z.string(),
  driverName: z.string(),
  origin: z.string(),
  destination: z.string(),
  startDate: z.string(),
  plannedDeliveryDate: z.string().nullable(),
  actualDeliveryDate: z.string().nullable(),
  distanceKm: z.string().nullable(),
  tripStatus: TripStatus,
});
export type TripSummary = z.infer<typeof TripSummarySchema>;

export const TripDetailSchema = TripSummarySchema.extend({
  cargoDescription: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TripDetail = z.infer<typeof TripDetailSchema>;

export const InvoiceSummarySchema = z.object({
  billingId: z.string(),
  invoiceNumber: z.string(),
  grossBilledAmount: z.string(),
  amountPaid: z.string(),
  outstandingBalance: z.string(),
  dueDate: z.string().nullable(),
  paymentStatus: PaymentStatus,
  isOverdue: z.boolean(),
});
export type InvoiceSummary = z.infer<typeof InvoiceSummarySchema>;

export const ExpenseEntrySchema = z.object({
  expenseId: z.string(),
  expenseCategory: ExpenseCategory,
  amount: z.string(),
  expenseDate: z.string(),
  description: z.string().nullable(),
});
export type ExpenseEntry = z.infer<typeof ExpenseEntrySchema>;

export const TripFinancialsSchema = z.object({
  tripId: z.string(),
  tripNumber: z.string(),
  invoices: z.array(InvoiceSummarySchema),
  grossBilledAmount: z.string(),
  amountPaid: z.string(),
  outstandingBalance: z.string(),
  recordedExpenses: z.string(),
  expenseBreakdown: z.record(z.string(), z.string()),
  tripProfit: z.string().nullable(),
  profitPerKm: z.string().nullable(),
  distanceKm: z.string().nullable(),
  hasBillingData: z.boolean(),
  hasExpenseData: z.boolean(),
  notes: z.array(z.string()),
});
export type TripFinancials = z.infer<typeof TripFinancialsSchema>;

export const DriverBriefSchema = z.object({
  driverId: z.string(),
  driverName: z.string(),
  driverStatus: DriverStatus,
});
export type DriverBrief = z.infer<typeof DriverBriefSchema>;

export const DocumentPassageSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  documentType: DocumentType,
  jurisdiction: z.string().nullable(),
  sourceReference: z.string().nullable(),
  documentVersion: z.string(),
  effectiveFrom: z.string().nullable(),
  effectiveTo: z.string().nullable(),
  isDemoContent: z.boolean(),
  excerpt: z.string(),
  relevanceScore: z.number().nullable(),
});
export type DocumentPassage = z.infer<typeof DocumentPassageSchema>;
