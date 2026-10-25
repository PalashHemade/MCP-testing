from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import (
    DocumentType,
    DriverStatus,
    ExpenseCategory,
    PaymentStatus,
    TripStatus,
    VehicleStatus,
)


class TripSummary(BaseModel):
    trip_id: UUID
    trip_number: str
    lr_number: str
    customer_id: UUID
    customer_name: str
    vehicle_id: UUID
    vehicle_registration_no: str
    driver_id: UUID
    driver_name: str
    origin: str
    destination: str
    start_date: date
    planned_delivery_date: date | None
    actual_delivery_date: date | None
    distance_km: Decimal | None
    trip_status: TripStatus


class TripDetail(TripSummary):
    cargo_description: str | None
    created_at: datetime
    updated_at: datetime


class InvoiceSummary(BaseModel):
    billing_id: UUID
    invoice_number: str
    freight_charge: Decimal
    additional_charges: Decimal
    tax_amount: Decimal
    gross_billed_amount: Decimal
    amount_paid: Decimal
    outstanding_balance: Decimal
    invoice_date: date | None
    due_date: date | None
    payment_status: PaymentStatus
    is_overdue: bool


class ExpenseEntry(BaseModel):
    expense_id: UUID
    expense_category: ExpenseCategory
    amount: Decimal
    expense_date: date
    description: str | None


class TripFinancials(BaseModel):
    trip_id: UUID
    trip_number: str
    invoices: list[InvoiceSummary]
    gross_billed_amount: Decimal
    amount_paid: Decimal
    outstanding_balance: Decimal
    recorded_expenses: Decimal
    expense_breakdown: dict[str, Decimal]
    trip_profit: Decimal | None
    profit_per_km: Decimal | None
    distance_km: Decimal | None
    has_billing_data: bool
    has_expense_data: bool
    notes: list[str]


class CustomerBrief(BaseModel):
    customer_id: UUID
    customer_name: str


class VehicleBrief(BaseModel):
    vehicle_id: UUID
    registration_no: str
    vehicle_type: str
    vehicle_status: VehicleStatus


class DriverBrief(BaseModel):
    driver_id: UUID
    driver_name: str
    driver_status: DriverStatus


class DocumentPassage(BaseModel):
    document_id: UUID
    title: str
    document_type: DocumentType
    jurisdiction: str | None
    source_reference: str | None
    document_version: str
    effective_from: date | None
    effective_to: date | None
    is_demo_content: bool
    chunk_text: str
    relevance_score: float | None
