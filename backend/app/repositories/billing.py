from datetime import date
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.enums import PaymentStatus
from app.models.trip import Trip
from app.models.billing import TripBilling


class BillingRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_invoices_for_trip(self, *, tenant_id: UUID, trip_id: UUID) -> list[TripBilling]:
        query = select(TripBilling).where(
            TripBilling.tenant_id == tenant_id, TripBilling.trip_id == trip_id
        ).order_by(TripBilling.invoice_date)
        return list((await self.session.execute(query)).scalars().all())

    async def get_invoices_for_trips(
        self, *, tenant_id: UUID, trip_ids: list[UUID]
    ) -> list[TripBilling]:
        if not trip_ids:
            return []
        query = select(TripBilling).where(
            TripBilling.tenant_id == tenant_id, TripBilling.trip_id.in_(trip_ids)
        )
        return list((await self.session.execute(query)).scalars().all())

    async def list_unpaid_invoices(
        self,
        *,
        tenant_id: UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        payment_status: PaymentStatus | None = None,
        customer_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[tuple], int]:
        """customer_id, when given, is an authorization filter (a
        "customer" role caller only ever sees their own invoices).
        """
        statuses = [payment_status] if payment_status else [
            PaymentStatus.UNPAID,
            PaymentStatus.PARTIALLY_PAID,
        ]

        base: Select = (
            select(TripBilling, Trip.trip_number, Customer.customer_id, Customer.customer_name)
            .join(Trip, (Trip.tenant_id == TripBilling.tenant_id) & (Trip.trip_id == TripBilling.trip_id))
            .join(Customer, (Customer.tenant_id == Trip.tenant_id) & (Customer.customer_id == Trip.customer_id))
            .where(TripBilling.tenant_id == tenant_id, TripBilling.payment_status.in_(statuses))
        )
        count_query = (
            select(func.count())
            .select_from(TripBilling)
            .join(Trip, (Trip.tenant_id == TripBilling.tenant_id) & (Trip.trip_id == TripBilling.trip_id))
            .where(TripBilling.tenant_id == tenant_id, TripBilling.payment_status.in_(statuses))
        )
        if customer_id:
            base = base.where(Trip.customer_id == customer_id)
            count_query = count_query.where(Trip.customer_id == customer_id)

        if start_date:
            base = base.where(TripBilling.invoice_date >= start_date)
            count_query = count_query.where(TripBilling.invoice_date >= start_date)
        if end_date:
            base = base.where(TripBilling.invoice_date <= end_date)
            count_query = count_query.where(TripBilling.invoice_date <= end_date)

        total_count = (await self.session.execute(count_query)).scalar_one()
        base = base.order_by(TripBilling.due_date.asc().nulls_last()).limit(limit).offset(offset)
        rows = (await self.session.execute(base)).all()
        return rows, total_count
