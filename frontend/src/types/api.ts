// Mirrors backend/app/schemas/*.py. Kept intentionally loose (unknown
// payload shapes per tool) since ToolExecutionSummary.output varies by
// tool_name - components narrow it with the per-tool type guards below.

export type CompletenessStatus = 'complete' | 'partial' | 'unknown'

export interface PageInfo {
  limit: number
  offset: number
  returned_count: number
  total_count: number | null
  has_more: boolean
}

export interface ToolExecutionSummary {
  step_id: string
  tool_name: string
  status: 'success' | 'error'
  duration_ms: number
  error: string | null
  output: Record<string, unknown> | null
}

export interface ChatResponse {
  request_id: string
  answer: string
  intent: string
  tool_executions: ToolExecutionSummary[]
  retrieval_method: string
  is_fully_complete: boolean
  validation_notes: string[]
  unsupported_reason: string | null
  clarification_required: boolean
}

export interface TripSummary {
  trip_id: string
  trip_number: string
  lr_number: string
  customer_id: string
  customer_name: string
  vehicle_id: string
  vehicle_registration_no: string
  driver_id: string
  driver_name: string
  origin: string
  destination: string
  start_date: string
  planned_delivery_date: string | null
  actual_delivery_date: string | null
  distance_km: string | null
  trip_status: 'planned' | 'in_transit' | 'completed' | 'cancelled'
}

export interface TripDetail extends TripSummary {
  cargo_description: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceSummary {
  billing_id: string
  invoice_number: string
  gross_billed_amount: string
  amount_paid: string
  outstanding_balance: string
  due_date: string | null
  payment_status: 'unpaid' | 'partially_paid' | 'paid' | 'draft' | 'cancelled'
  is_overdue: boolean
}

export interface TripFinancials {
  trip_id: string
  trip_number: string
  invoices: InvoiceSummary[]
  gross_billed_amount: string
  amount_paid: string
  outstanding_balance: string
  recorded_expenses: string
  expense_breakdown: Record<string, string>
  trip_profit: string | null
  profit_per_km: string | null
  distance_km: string | null
  has_billing_data: boolean
  has_expense_data: boolean
  notes: string[]
}

export interface DocumentPassage {
  document_id: string
  title: string
  document_type: string
  jurisdiction: string | null
  source_reference: string | null
  document_version: string
  effective_from: string | null
  effective_to: string | null
  is_demo_content: boolean
  chunk_text: string
  relevance_score: number | null
}

export interface VehicleUtilizationResult {
  vehicle_id: string
  registration_no: string
  vehicle_type: string
  trip_count: number
  completed_trip_count: number
  in_transit_trip_count: number
  total_recorded_distance_km: string
}

export interface CustomerTripSummaryResult {
  customer_id: string
  customer_name: string
  trip_count: number
  completed_count: number
  in_transit_count: number
  cancelled_count: number
  gross_billed_amount: string
  amount_paid: string
  outstanding_balance: string
  recorded_expenses: string
  trip_profit: string | null
}

export interface RouteProfitabilityResult {
  origin: string
  destination: string
  trip_count: number
  gross_billed_amount: string
  recorded_expenses: string
  aggregate_profit: string
  total_distance_km: string
  aggregate_profit_per_km: string | null
  excluded_below_min_sample: boolean
}

export interface UnpaidInvoiceRow {
  billing_id: string
  invoice_number: string
  trip_number: string
  customer_name: string
  gross_billed_amount: string
  amount_paid: string
  outstanding_balance: string
  due_date: string | null
  payment_status: string
  is_overdue: boolean
}

export interface ToolMetadata {
  name: string
  purpose: string
  description: string
  input_schema: Record<string, unknown>
  limitations: string
  permissions: string
  example_questions: string[]
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  response?: ChatResponse
}

// This customer-portal UI only ever logs in as a customer - operator/admin
// access (app.auth.dev_auth: "demo-ops-primary"/"demo-ops-secondary") is a
// separate, internal developer/platform concern and intentionally has no
// entry point here. It's still fully usable via the API directly
// (X-Demo-User header) or the standalone MCP server for backend testing -
// see backend/tests and docs/security.md.
export const DEMO_USERS = [
  { key: 'demo-customer-acme', label: 'Acme Traders - Customer A' },
  { key: 'demo-customer-bharat', label: 'Bharat Textiles - Customer B' },
  { key: 'demo-customer-oceanic', label: 'Oceanic Imports - Customer C' },
] as const

export type DemoUserKey = (typeof DEMO_USERS)[number]['key']
