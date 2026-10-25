"""Pydantic input/output contracts for the 10 MCP tools.

Every tool returns an envelope with `completeness` + (where relevant)
`page_info`, so the orchestrator/validator can tell a genuinely exhaustive
result from a partial one without guessing from record counts alone.
"""
from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.enums import DocumentType, ExpenseCategory, PaymentStatus, TripStatus
from app.schemas.common import CompletenessStatus, PageInfo
from app.schemas.domain import (
    DocumentPassage,
    DriverBrief,
    ExpenseEntry,
    InvoiceSummary,
    TripDetail,
    TripFinancials,
    TripSummary,
)


# ---- Tool 1: list_trips --------------------------------------------------
class ListTripsInput(BaseModel):
    start_date: date | None = None
    end_date: date | None = None
    trip_status: TripStatus | None = None
    customer_id: UUID | None = None
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    origin: str | None = None
    destination: str | None = None
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_dates(self) -> "ListTripsInput":
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        return self


class ListTripsOutput(BaseModel):
    trips: list[TripSummary]
    applied_filters: dict
    page_info: PageInfo
    completeness: CompletenessStatus


# ---- Tool 2: get_trip_details -------------------------------------------
class GetTripDetailsInput(BaseModel):
    trip_number: str | None = None
    trip_id: UUID | None = None

    @model_validator(mode="after")
    def require_one(self) -> "GetTripDetailsInput":
        if not self.trip_number and not self.trip_id:
            raise ValueError("one of trip_number or trip_id is required")
        return self


class GetTripDetailsOutput(BaseModel):
    found: bool
    trip: TripDetail | None
    completeness: CompletenessStatus


# ---- Tool 3: get_trip_financials -----------------------------------------
class GetTripFinancialsInput(BaseModel):
    trip_number: str | None = None
    trip_id: UUID | None = None

    @model_validator(mode="after")
    def require_one(self) -> "GetTripFinancialsInput":
        if not self.trip_number and not self.trip_id:
            raise ValueError("one of trip_number or trip_id is required")
        return self


class GetTripFinancialsOutput(BaseModel):
    found: bool
    financials: TripFinancials | None
    completeness: CompletenessStatus


# ---- Tool 4: get_trip_expenses -------------------------------------------
class GetTripExpensesInput(BaseModel):
    trip_number: str | None = None
    trip_id: UUID | None = None
    expense_category: ExpenseCategory | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def require_one(self) -> "GetTripExpensesInput":
        if not self.trip_number and not self.trip_id:
            raise ValueError("one of trip_number or trip_id is required")
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        return self


class GetTripExpensesOutput(BaseModel):
    found: bool
    trip_id: UUID | None
    expenses: list[ExpenseEntry]
    category_breakdown: dict[str, Decimal]
    total_recorded_expenses: Decimal
    applied_filters: dict
    completeness: CompletenessStatus


# ---- Tool 5: get_customer_trip_summary ------------------------------------
class GetCustomerTripSummaryInput(BaseModel):
    customer_id: UUID | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "GetCustomerTripSummaryInput":
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        return self


class CustomerTripSummaryResult(BaseModel):
    customer_id: UUID
    customer_name: str
    trip_count: int
    completed_count: int
    in_transit_count: int
    cancelled_count: int
    gross_billed_amount: Decimal
    amount_paid: Decimal
    outstanding_balance: Decimal
    recorded_expenses: Decimal
    trip_profit: Decimal | None


class GetCustomerTripSummaryOutput(BaseModel):
    results: list[CustomerTripSummaryResult]
    applied_filters: dict
    completeness: CompletenessStatus


# ---- Tool 6: list_unpaid_invoices -----------------------------------------
class ListUnpaidInvoicesInput(BaseModel):
    start_date: date | None = None
    end_date: date | None = None
    payment_status: PaymentStatus | None = None
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_dates(self) -> "ListUnpaidInvoicesInput":
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        return self


class UnpaidInvoiceRow(BaseModel):
    billing_id: UUID
    invoice_number: str
    trip_id: UUID
    trip_number: str
    customer_id: UUID
    customer_name: str
    gross_billed_amount: Decimal
    amount_paid: Decimal
    outstanding_balance: Decimal
    due_date: date | None
    payment_status: PaymentStatus
    is_overdue: bool


class ListUnpaidInvoicesOutput(BaseModel):
    invoices: list[UnpaidInvoiceRow]
    applied_filters: dict
    page_info: PageInfo
    completeness: CompletenessStatus
    default_scope_note: str = (
        "Default scope includes both 'unpaid' and 'partially_paid' invoices "
        "unless payment_status is explicitly provided. 'draft' and "
        "'cancelled' invoices are never included."
    )


# ---- Tool 7: get_vehicle_utilization --------------------------------------
class GetVehicleUtilizationInput(BaseModel):
    vehicle_id: UUID | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "GetVehicleUtilizationInput":
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        return self


class VehicleUtilizationResult(BaseModel):
    vehicle_id: UUID
    registration_no: str
    vehicle_type: str
    trip_count: int
    completed_trip_count: int
    in_transit_trip_count: int
    total_recorded_distance_km: Decimal


class GetVehicleUtilizationOutput(BaseModel):
    results: list[VehicleUtilizationResult]
    applied_filters: dict
    completeness: CompletenessStatus
    limitation_note: str = (
        "Utilization is reported only as trip counts and recorded distance. "
        "The schema does not track vehicle availability hours, so no "
        "percentage-utilization metric is computed."
    )


# ---- Tool 8: get_driver_trip_history ---------------------------------------
class GetDriverTripHistoryInput(BaseModel):
    driver_id: UUID | None = None
    driver_name: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def require_one(self) -> "GetDriverTripHistoryInput":
        if not self.driver_id and not self.driver_name:
            raise ValueError("one of driver_id or driver_name is required")
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        return self


class GetDriverTripHistoryOutput(BaseModel):
    ambiguous: bool
    matching_drivers: list[DriverBrief]
    driver: DriverBrief | None
    trips: list[TripSummary]
    trip_count: int
    total_recorded_distance_km: Decimal
    page_info: PageInfo | None
    completeness: CompletenessStatus


# ---- Tool 9: compare_route_profitability -----------------------------------
class CompareRouteProfitabilityInput(BaseModel):
    start_date: date | None = None
    end_date: date | None = None
    origin: str | None = None
    destination: str | None = None
    min_sample_size: int = Field(default=1, ge=1)

    @model_validator(mode="after")
    def validate_dates(self) -> "CompareRouteProfitabilityInput":
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not be after end_date")
        return self


class RouteProfitabilityResult(BaseModel):
    origin: str
    destination: str
    trip_count: int
    gross_billed_amount: Decimal
    recorded_expenses: Decimal
    aggregate_profit: Decimal
    total_distance_km: Decimal
    aggregate_profit_per_km: Decimal | None
    excluded_below_min_sample: bool


class CompareRouteProfitabilityOutput(BaseModel):
    results: list[RouteProfitabilityResult]
    applied_filters: dict
    completeness: CompletenessStatus
    directionality_note: str = (
        "Routes are directional: origin -> destination is grouped "
        "separately from destination -> origin."
    )
    metric_note: str = (
        "aggregate_profit_per_km = sum(trip profit) / sum(trip distance_km) "
        "across all trips in the route group - this is NOT the average of "
        "each trip's individual profit-per-km ratio."
    )


# ---- Tool 10: search_logistics_documents -----------------------------------
class SearchLogisticsDocumentsInput(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    document_type: DocumentType | None = None
    jurisdiction: str | None = None
    effective_date: date | None = None
    limit: int = Field(default=5, ge=1, le=20)


class SearchLogisticsDocumentsOutput(BaseModel):
    passages: list[DocumentPassage]
    applied_filters: dict
    retrieval_method: str
    found_relevant_results: bool
    completeness: CompletenessStatus
