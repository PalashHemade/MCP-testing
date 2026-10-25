from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TripStatus
from app.repositories.billing import BillingRepository
from app.repositories.customers import CustomerRepository
from app.repositories.expenses import ExpenseRepository
from app.repositories.trips import TripRepository
from app.schemas.tools import CustomerTripSummaryResult
from app.services.financials import sum_expenses, sum_included_invoices, trip_profit


class CustomerService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.trips = TripRepository(session)
        self.billing = BillingRepository(session)
        self.expenses = ExpenseRepository(session)
        self.customers = CustomerRepository(session)

    async def get_customer_trip_summary(
        self,
        *,
        tenant_id: UUID,
        customer_id: UUID | None,
        start_date: date | None,
        end_date: date | None,
    ) -> list[CustomerTripSummaryResult]:
        if customer_id:
            customers = [c for c in [await self.customers.get(tenant_id=tenant_id, customer_id=customer_id)] if c]
        else:
            customers = await self.customers.list_for_tenant(tenant_id=tenant_id)

        results: list[CustomerTripSummaryResult] = []
        for customer in customers:
            rows, _total = await self.trips.list_trips(
                tenant_id=tenant_id,
                customer_id=customer.customer_id,
                start_date=start_date,
                end_date=end_date,
                limit=500,
                offset=0,
            )
            trip_ids = [r[0].trip_id for r in rows]
            if not trip_ids:
                results.append(
                    CustomerTripSummaryResult(
                        customer_id=customer.customer_id,
                        customer_name=customer.customer_name,
                        trip_count=0,
                        completed_count=0,
                        in_transit_count=0,
                        cancelled_count=0,
                        gross_billed_amount=Decimal("0.00"),
                        amount_paid=Decimal("0.00"),
                        outstanding_balance=Decimal("0.00"),
                        recorded_expenses=Decimal("0.00"),
                        trip_profit=None,
                    )
                )
                continue

            completed = sum(1 for r in rows if r[0].trip_status == TripStatus.COMPLETED)
            in_transit = sum(1 for r in rows if r[0].trip_status == TripStatus.IN_TRANSIT)
            cancelled = sum(1 for r in rows if r[0].trip_status == TripStatus.CANCELLED)

            invoices = await self.billing.get_invoices_for_trips(tenant_id=tenant_id, trip_ids=trip_ids)
            expenses = await self.expenses.get_expenses_for_trips(tenant_id=tenant_id, trip_ids=trip_ids)

            gross, paid, outstanding = sum_included_invoices(invoices)
            recorded_expenses = sum_expenses(expenses)
            profit = trip_profit(gross, recorded_expenses) if invoices else None

            results.append(
                CustomerTripSummaryResult(
                    customer_id=customer.customer_id,
                    customer_name=customer.customer_name,
                    trip_count=len(trip_ids),
                    completed_count=completed,
                    in_transit_count=in_transit,
                    cancelled_count=cancelled,
                    gross_billed_amount=gross,
                    amount_paid=paid,
                    outstanding_balance=outstanding,
                    recorded_expenses=recorded_expenses,
                    trip_profit=profit,
                )
            )
        return results
