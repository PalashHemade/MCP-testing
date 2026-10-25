"""Proves one tenant cannot retrieve another tenant's data, including when
an attacker supplies a VALID id belonging to the other tenant directly
(not just a guessed/nonexistent one).
"""
import pytest

from app.auth.dev_auth import TENANT_PRIMARY, TENANT_SECONDARY
from app.mcp.tools import (
    get_customer_trip_summary,
    get_driver_trip_history,
    get_trip_details,
    get_trip_expenses,
    get_trip_financials,
    get_vehicle_utilization,
    search_logistics_documents,
)
from app.schemas.tools import (
    GetCustomerTripSummaryInput,
    GetDriverTripHistoryInput,
    GetTripDetailsInput,
    GetTripExpensesInput,
    GetTripFinancialsInput,
    GetVehicleUtilizationInput,
    SearchLogisticsDocumentsInput,
)
from app.scripts.seed_demo import nid

PRIMARY_TRIP_ID = nid("trip", TENANT_PRIMARY.hex, "TRIP-1001")
PRIMARY_CUSTOMER_ID = nid("customer", "primary", "acme")
PRIMARY_VEHICLE_ID = nid("vehicle", "primary", "v1")
PRIMARY_DRIVER_ID = nid("driver", "primary", "ramesh")


@pytest.mark.asyncio
async def test_secondary_cannot_get_primary_trip_details_by_number(db_session, secondary_user):
    out = await get_trip_details.run(db_session, secondary_user, GetTripDetailsInput(trip_number="TRIP-1001"))
    assert out.found is False


@pytest.mark.asyncio
async def test_secondary_cannot_get_primary_trip_by_valid_id(db_session, secondary_user):
    out = await get_trip_details.run(db_session, secondary_user, GetTripDetailsInput(trip_id=PRIMARY_TRIP_ID))
    assert out.found is False


@pytest.mark.asyncio
async def test_secondary_cannot_get_primary_trip_financials(db_session, secondary_user):
    out = await get_trip_financials.run(db_session, secondary_user, GetTripFinancialsInput(trip_id=PRIMARY_TRIP_ID))
    assert out.found is False
    assert out.financials is None


@pytest.mark.asyncio
async def test_secondary_cannot_get_primary_trip_expenses(db_session, secondary_user):
    out = await get_trip_expenses.run(db_session, secondary_user, GetTripExpensesInput(trip_id=PRIMARY_TRIP_ID))
    assert out.found is False
    assert out.expenses == []


@pytest.mark.asyncio
async def test_secondary_cannot_get_primary_customer_summary(db_session, secondary_user):
    out = await get_customer_trip_summary.run(
        db_session, secondary_user, GetCustomerTripSummaryInput(customer_id=PRIMARY_CUSTOMER_ID)
    )
    assert out.results == []


@pytest.mark.asyncio
async def test_secondary_cannot_get_primary_vehicle_utilization(db_session, secondary_user):
    out = await get_vehicle_utilization.run(
        db_session, secondary_user, GetVehicleUtilizationInput(vehicle_id=PRIMARY_VEHICLE_ID)
    )
    assert out.results == []


@pytest.mark.asyncio
async def test_secondary_cannot_get_primary_driver_history(db_session, secondary_user):
    out = await get_driver_trip_history.run(
        db_session, secondary_user, GetDriverTripHistoryInput(driver_id=PRIMARY_DRIVER_ID)
    )
    assert out.driver is None
    assert out.trips == []


@pytest.mark.asyncio
async def test_secondary_cannot_retrieve_primary_private_document(db_session, secondary_user):
    out = await search_logistics_documents.run(
        db_session, secondary_user, SearchLogisticsDocumentsInput(query="fuel toll expense allowance policy receipt")
    )
    titles = [p.title for p in out.passages]
    assert "Primary Logistics Co Internal Expense Policy" not in titles


@pytest.mark.asyncio
async def test_global_demo_document_is_visible_to_both_tenants(db_session, primary_user, secondary_user):
    for user in (primary_user, secondary_user):
        out = await search_logistics_documents.run(
            db_session, user, SearchLogisticsDocumentsInput(query="port entry documentation requirements")
        )
        titles = [p.title for p in out.passages]
        assert "Demo Port Entry Documentation Policy" in titles
