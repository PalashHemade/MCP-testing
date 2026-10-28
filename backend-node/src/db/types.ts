/** Raw row shapes as returned by `pg` (snake_case columns, NUMERIC/DATE
 * as strings) - repositories map these into the camelCase domain types
 * in src/schemas/domain.ts. Kept separate so a schema column rename
 * only touches one layer.
 */
export interface TripRow {
  trip_id: string;
  tenant_id: string;
  trip_number: string;
  customer_id: string;
  vehicle_id: string;
  driver_id: string;
  lr_number: string;
  origin: string;
  destination: string;
  start_date: string;
  planned_delivery_date: string | null;
  actual_delivery_date: string | null;
  distance_km: string | null;
  trip_status: string;
  cargo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripWithJoinsRow extends TripRow {
  customer_name: string;
  vehicle_registration_no: string;
  driver_name: string;
}

export interface TripBillingRow {
  billing_id: string;
  tenant_id: string;
  trip_id: string;
  invoice_number: string;
  freight_charge: string;
  additional_charges: string;
  tax_amount: string;
  amount_paid: string;
  invoice_date: string | null;
  due_date: string | null;
  payment_status: string;
}

export interface TripExpenseRow {
  expense_id: string;
  tenant_id: string;
  trip_id: string;
  expense_category: string;
  amount: string;
  expense_date: string;
  description: string | null;
}

export interface CustomerRow {
  customer_id: string;
  tenant_id: string;
  customer_name: string;
}

export interface VehicleRow {
  vehicle_id: string;
  tenant_id: string;
  registration_no: string;
  vehicle_type: string;
  vehicle_status: string;
}

export interface DriverRow {
  driver_id: string;
  tenant_id: string;
  driver_name: string;
  driver_status: string;
}

export interface LogisticsDocumentRow {
  document_id: string;
  tenant_id: string | null;
  title: string;
  document_type: string;
  jurisdiction: string | null;
  source_reference: string | null;
  document_version: string;
  effective_from: string | null;
  effective_to: string | null;
  content: string;
  is_demo_content: boolean;
  okf_concept_path: string | null;
}
