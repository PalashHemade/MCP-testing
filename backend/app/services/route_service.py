from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.billing import BillingRepository
from app.repositories.expenses import ExpenseRepository
from app.repositories.trips import TripRepository
from app.schemas.tools import RouteProfitabilityResult
from app.services.financials import sum_expenses, sum_included_invoices


class RouteService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.trips = TripRepository(session)
        self.billing = BillingRepository(session)
        self.expenses = ExpenseRepository(session)

    async def compare_route_profitability(
        self,
        *,
        tenant_id: UUID,
        start_date: date | None,
        end_date: date | None,
        origin: str | None,
        destination: str | None,
        min_sample_size: int,
    ) -> list[RouteProfitabilityResult]:
        rows, _total = await self.trips.list_trips(
            tenant_id=tenant_id,
            start_date=start_date,
            end_date=end_date,
            origin=origin,
            destination=destination,
            limit=500,
            offset=0,
        )

        groups: dict[tuple[str, str], list] = defaultdict(list)
        for row in rows:
            trip = row[0]
            groups[(trip.origin, trip.destination)].append(trip)

        results: list[RouteProfitabilityResult] = []
        for (orig, dest), trips in groups.items():
            trip_ids = [t.trip_id for t in trips]
            invoices = await self.billing.get_invoices_for_trips(tenant_id=tenant_id, trip_ids=trip_ids)
            expenses = await self.expenses.get_expenses_for_trips(tenant_id=tenant_id, trip_ids=trip_ids)

            gross, _paid, _outstanding = sum_included_invoices(invoices)
            recorded_expenses = sum_expenses(expenses)
            profit = gross - recorded_expenses
            total_distance = sum((t.distance_km for t in trips if t.distance_km is not None), Decimal("0"))

            excluded = len(trips) < min_sample_size
            per_km = None
            if not excluded and total_distance > 0:
                per_km = (profit / total_distance).quantize(Decimal("0.01"))

            results.append(
                RouteProfitabilityResult(
                    origin=orig,
                    destination=dest,
                    trip_count=len(trips),
                    gross_billed_amount=gross,
                    recorded_expenses=recorded_expenses,
                    aggregate_profit=profit,
                    total_distance_km=total_distance,
                    aggregate_profit_per_km=per_km,
                    excluded_below_min_sample=excluded,
                )
            )

        results.sort(key=lambda r: (r.aggregate_profit_per_km is None, -(r.aggregate_profit_per_km or Decimal("-999999"))))
        return results
