from decimal import Decimal

import pytest

from app.mcp.tools import (
    compare_route_profitability,
    get_driver_trip_history,
    get_trip_financials,
    get_vehicle_utilization,
    list_trips,
    list_unpaid_invoices,
)
from app.schemas.common import CompletenessStatus
from app.schemas.tools import (
    CompareRouteProfitabilityInput,
    GetDriverTripHistoryInput,
    GetTripFinancialsInput,
    GetVehicleUtilizationInput,
    ListTripsInput,
    ListUnpaidInvoicesInput,
)


@pytest.mark.asyncio
async def test_list_trips_pagination_flags_partial_result(db_session, primary_user):
    out = await list_trips.run(db_session, primary_user, ListTripsInput(limit=5, offset=0))
    assert out.page_info.returned_count == 5
    assert out.page_info.total_count is not None and out.page_info.total_count > 5
    assert out.completeness == CompletenessStatus.PARTIAL
    assert out.page_info.has_more is True


@pytest.mark.asyncio
async def test_list_trips_full_page_is_complete(db_session, primary_user):
    out = await list_trips.run(db_session, primary_user, ListTripsInput(limit=500, offset=0))
    assert out.page_info.has_more is False
    assert out.completeness == CompletenessStatus.COMPLETE


@pytest.mark.asyncio
async def test_multiple_invoices_aggregate_without_double_counting_expenses(db_session, primary_user):
    out = await get_trip_financials.run(db_session, primary_user, GetTripFinancialsInput(trip_number="TRIP-1009"))
    f = out.financials
    assert len(f.invoices) == 2
    assert f.gross_billed_amount == Decimal("28500.00")
    assert f.amount_paid == Decimal("23000.00")
    assert f.outstanding_balance == Decimal("5500.00")
    assert f.recorded_expenses == Decimal("3500.00")
    assert f.trip_profit == Decimal("25000.00")


@pytest.mark.asyncio
async def test_unpaid_invoices_default_scope_excludes_draft_and_paid(db_session, primary_user):
    out = await list_unpaid_invoices.run(db_session, primary_user, ListUnpaidInvoicesInput(limit=500))
    statuses = {inv.payment_status.value for inv in out.invoices}
    assert statuses <= {"unpaid", "partially_paid"}
    invoice_numbers = {inv.invoice_number for inv in out.invoices}
    assert "INV-TRIP-1008-A" not in invoice_numbers  # draft, excluded


@pytest.mark.asyncio
async def test_route_profitability_is_directional(db_session, primary_user):
    out = await compare_route_profitability.run(
        db_session, primary_user, CompareRouteProfitabilityInput(limit=500, min_sample_size=1)
    )
    routes = {(r.origin, r.destination) for r in out.results}
    assert ("Mumbai", "Delhi") in routes
    # The reverse direction was not seeded, so it must not silently merge in:
    assert ("Delhi", "Mumbai") not in routes


@pytest.mark.asyncio
async def test_route_profitability_uses_aggregate_not_average_of_ratios(db_session, primary_user):
    out = await compare_route_profitability.run(
        db_session, primary_user, CompareRouteProfitabilityInput(origin="Mumbai", destination="Delhi")
    )
    route = next(r for r in out.results if r.origin == "Mumbai" and r.destination == "Delhi")
    if route.total_distance_km > 0:
        expected = (route.aggregate_profit / route.total_distance_km).quantize(Decimal("0.01"))
        assert route.aggregate_profit_per_km == expected


@pytest.mark.asyncio
async def test_vehicle_utilization_reports_counts_and_distance_no_percentage(db_session, primary_user):
    out = await get_vehicle_utilization.run(db_session, primary_user, GetVehicleUtilizationInput())
    assert len(out.results) == 3  # 3 vehicles on the primary tenant
    for result in out.results:
        assert result.trip_count >= 0
        assert not hasattr(result, "utilization_percentage")


@pytest.mark.asyncio
async def test_ambiguous_driver_name_returns_candidates_not_a_guess(db_session, primary_user):
    out = await get_driver_trip_history.run(db_session, primary_user, GetDriverTripHistoryInput(driver_name="Ramesh"))
    assert out.ambiguous is True
    assert len(out.matching_drivers) == 2
    assert out.trips == []


@pytest.mark.asyncio
async def test_unambiguous_driver_name_resolves(db_session, primary_user):
    out = await get_driver_trip_history.run(db_session, primary_user, GetDriverTripHistoryInput(driver_name="Vikram"))
    assert out.ambiguous is False
    assert out.driver is not None
    assert out.driver.driver_name == "Vikram Singh"


@pytest.mark.asyncio
async def test_unknown_driver_name_is_not_found(db_session, primary_user):
    out = await get_driver_trip_history.run(
        db_session, primary_user, GetDriverTripHistoryInput(driver_name="NoSuchDriverXYZ")
    )
    assert out.ambiguous is False
    assert out.driver is None
    assert out.trips == []
