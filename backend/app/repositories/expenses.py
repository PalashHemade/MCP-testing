from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ExpenseCategory
from app.models.expense import TripExpense


class ExpenseRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_expenses_for_trip(
        self,
        *,
        tenant_id: UUID,
        trip_id: UUID,
        expense_category: ExpenseCategory | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[TripExpense]:
        query = select(TripExpense).where(
            TripExpense.tenant_id == tenant_id, TripExpense.trip_id == trip_id
        )
        if expense_category:
            query = query.where(TripExpense.expense_category == expense_category)
        if start_date:
            query = query.where(TripExpense.expense_date >= start_date)
        if end_date:
            query = query.where(TripExpense.expense_date <= end_date)
        query = query.order_by(TripExpense.expense_date)
        return list((await self.session.execute(query)).scalars().all())

    async def get_expenses_for_trips(
        self, *, tenant_id: UUID, trip_ids: list[UUID]
    ) -> list[TripExpense]:
        if not trip_ids:
            return []
        query = select(TripExpense).where(
            TripExpense.tenant_id == tenant_id, TripExpense.trip_id.in_(trip_ids)
        )
        return list((await self.session.execute(query)).scalars().all())
