from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ExpenseCategory, TripStatus
from app.repositories.billing import BillingRepository
from app.repositories.expenses import ExpenseRepository
from app.repositories.trips import TripRepository
from app.schemas.common import CompletenessStatus, PageInfo
from app.schemas.domain import ExpenseEntry, InvoiceSummary, TripDetail, TripFinancials, TripSummary
from app.services.financials import (
    expense_breakdown,
    is_overdue,
    outstanding_balance,
    profit_per_km,
    sum_expenses,
    sum_included_invoices,
    trip_profit,
)


def _row_to_summary(row) -> TripSummary:
    trip, customer_name, vehicle_reg, driver_name = row
    return TripSummary(
        trip_id=trip.trip_id,
        trip_number=trip.trip_number,
        lr_number=trip.lr_number,
        customer_id=trip.customer_id,
        customer_name=customer_name,
        vehicle_id=trip.vehicle_id,
        vehicle_registration_no=vehicle_reg,
        driver_id=trip.driver_id,
        driver_name=driver_name,
        origin=trip.origin,
        destination=trip.destination,
        start_date=trip.start_date,
        planned_delivery_date=trip.planned_delivery_date,
        actual_delivery_date=trip.actual_delivery_date,
        distance_km=trip.distance_km,
        trip_status=trip.trip_status,
    )


class TripService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.trips = TripRepository(session)
        self.billing = BillingRepository(session)
        self.expenses = ExpenseRepository(session)

    async def list_trips(
        self,
        *,
        tenant_id: UUID,
        start_date: date | None,
        end_date: date | None,
        trip_status: TripStatus | None,
        customer_id: UUID | None,
        vehicle_id: UUID | None,
        driver_id: UUID | None,
        origin: str | None,
        destination: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[TripSummary], PageInfo, CompletenessStatus]:
        rows, total_count = await self.trips.list_trips(
            tenant_id=tenant_id,
            start_date=start_date,
            end_date=end_date,
            trip_status=trip_status,
            customer_id=customer_id,
            vehicle_id=vehicle_id,
            driver_id=driver_id,
            origin=origin,
            destination=destination,
            limit=limit,
            offset=offset,
        )
        summaries = [_row_to_summary(r) for r in rows]
        has_more = offset + len(summaries) < total_count
        page_info = PageInfo(
            limit=limit, offset=offset, returned_count=len(summaries),
            total_count=total_count, has_more=has_more,
        )
        completeness = CompletenessStatus.PARTIAL if has_more else CompletenessStatus.COMPLETE
        return summaries, page_info, completeness

    async def get_trip_details(
        self,
        *,
        tenant_id: UUID,
        trip_number: str | None,
        trip_id: UUID | None,
        customer_scope: UUID | None = None,
    ) -> TripDetail | None:
        row = await self.trips.get_by_number_or_id(
            tenant_id=tenant_id, trip_number=trip_number, trip_id=trip_id, customer_id=customer_scope
        )
        if row is None:
            return None
        trip, customer_name, vehicle_reg, driver_name = row
        summary = _row_to_summary(row)
        return TripDetail(
            **summary.model_dump(),
            cargo_description=trip.cargo_description,
            created_at=trip.created_at,
            updated_at=trip.updated_at,
        )

    async def get_trip_financials(
        self,
        *,
        tenant_id: UUID,
        trip_number: str | None,
        trip_id: UUID | None,
        as_of: date,
        customer_scope: UUID | None = None,
    ) -> TripFinancials | None:
        row = await self.trips.get_by_number_or_id(
            tenant_id=tenant_id, trip_number=trip_number, trip_id=trip_id, customer_id=customer_scope
        )
        if row is None:
            return None
        trip = row[0]

        invoices = await self.billing.get_invoices_for_trip(tenant_id=tenant_id, trip_id=trip.trip_id)
        expenses = await self.expenses.get_expenses_for_trip(tenant_id=tenant_id, trip_id=trip.trip_id)

        gross, paid, outstanding = sum_included_invoices(invoices)
        recorded_expenses = sum_expenses(expenses)
        breakdown = expense_breakdown(expenses)

        has_billing_data = len(invoices) > 0
        has_expense_data = len(expenses) > 0

        notes: list[str] = []
        profit: Decimal | None
        if not has_billing_data:
            profit = None
            notes.append("No invoice is recorded for this trip; profit cannot be calculated.")
        else:
            profit = trip_profit(gross, recorded_expenses)
            if not has_expense_data:
                notes.append(
                    "No expense entries are recorded for this trip. This profit figure "
                    "assumes zero recorded expenses, which may understate true cost if "
                    "expenses simply have not been logged yet."
                )

        per_km = profit_per_km(profit, trip.distance_km)
        if profit is not None and per_km is None:
            notes.append(
                "distance_km is missing or not positive, so profit-per-kilometre is undefined."
            )

        if trip.trip_status.value == "cancelled":
            notes.append(
                "This trip is cancelled; figures reflect whatever billing/expenses were "
                "recorded regardless of cancellation."
            )

        invoice_summaries = [
            InvoiceSummary(
                billing_id=inv.billing_id,
                invoice_number=inv.invoice_number,
                freight_charge=inv.freight_charge,
                additional_charges=inv.additional_charges,
                tax_amount=inv.tax_amount,
                gross_billed_amount=inv.freight_charge + inv.additional_charges + inv.tax_amount,
                amount_paid=inv.amount_paid,
                outstanding_balance=outstanding_balance(inv),
                invoice_date=inv.invoice_date,
                due_date=inv.due_date,
                payment_status=inv.payment_status,
                is_overdue=is_overdue(inv, as_of=as_of),
            )
            for inv in invoices
        ]

        return TripFinancials(
            trip_id=trip.trip_id,
            trip_number=trip.trip_number,
            invoices=invoice_summaries,
            gross_billed_amount=gross,
            amount_paid=paid,
            outstanding_balance=outstanding,
            recorded_expenses=recorded_expenses,
            expense_breakdown=breakdown,
            trip_profit=profit,
            profit_per_km=per_km,
            distance_km=trip.distance_km,
            has_billing_data=has_billing_data,
            has_expense_data=has_expense_data,
            notes=notes,
        )

    async def get_trip_expenses(
        self,
        *,
        tenant_id: UUID,
        trip_number: str | None,
        trip_id: UUID | None,
        expense_category: ExpenseCategory | None,
        start_date: date | None,
        end_date: date | None,
        customer_scope: UUID | None = None,
    ) -> tuple[UUID, list[ExpenseEntry], dict[str, Decimal], Decimal] | None:
        row = await self.trips.get_by_number_or_id(
            tenant_id=tenant_id, trip_number=trip_number, trip_id=trip_id, customer_id=customer_scope
        )
        if row is None:
            return None
        trip = row[0]
        expenses = await self.expenses.get_expenses_for_trip(
            tenant_id=tenant_id,
            trip_id=trip.trip_id,
            expense_category=expense_category,
            start_date=start_date,
            end_date=end_date,
        )
        entries = [
            ExpenseEntry(
                expense_id=e.expense_id,
                expense_category=e.expense_category,
                amount=e.amount,
                expense_date=e.expense_date,
                description=e.description,
            )
            for e in expenses
        ]
        return trip.trip_id, entries, expense_breakdown(expenses), sum_expenses(expenses)
