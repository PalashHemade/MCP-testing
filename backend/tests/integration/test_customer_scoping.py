"""Application-level enforcement for the "customer" role - independent of
RLS (see test_row_level_security.py for the DB-level proof). These run
through the actual tool run() functions, same as a real request would.
"""
import pytest

from app.mcp.tools import (
    get_customer_trip_summary,
    get_trip_details,
    get_trip_financials,
    list_trips,
    list_unpaid_invoices,
)
from app.schemas.tools import (
    GetCustomerTripSummaryInput,
    GetTripDetailsInput,
    GetTripFinancialsInput,
    ListTripsInput,
    ListUnpaidInvoicesInput,
)
from app.scripts.seed_demo import nid
from app.auth.dev_auth import TENANT_PRIMARY

BHARAT_TRIP_ID = nid("trip", TENANT_PRIMARY.hex, "TRIP-1002")
BHARAT_CUSTOMER_ID = nid("customer", "primary", "bharat")


@pytest.mark.asyncio
async def test_customer_sees_own_trip_details(db_session, customer_acme_user):
    out = await get_trip_details.run(db_session, customer_acme_user, GetTripDetailsInput(trip_number="TRIP-1001"))
    assert out.found is True
    assert out.trip.customer_name == "Acme Traders"


@pytest.mark.asyncio
async def test_customer_cannot_get_another_customers_trip_by_number(db_session, customer_acme_user):
    out = await get_trip_details.run(db_session, customer_acme_user, GetTripDetailsInput(trip_number="TRIP-1002"))
    assert out.found is False  # TRIP-1002 belongs to Bharat, not Acme


@pytest.mark.asyncio
async def test_customer_cannot_get_another_customers_trip_by_valid_id(db_session, customer_acme_user):
    out = await get_trip_details.run(db_session, customer_acme_user, GetTripDetailsInput(trip_id=BHARAT_TRIP_ID))
    assert out.found is False


@pytest.mark.asyncio
async def test_customer_cannot_get_another_customers_financials(db_session, customer_acme_user):
    out = await get_trip_financials.run(db_session, customer_acme_user, GetTripFinancialsInput(trip_id=BHARAT_TRIP_ID))
    assert out.found is False
    assert out.financials is None


@pytest.mark.asyncio
async def test_list_trips_for_customer_only_returns_own_trips(db_session, customer_acme_user):
    out = await list_trips.run(db_session, customer_acme_user, ListTripsInput(limit=500))
    customer_names = {t.customer_name for t in out.trips}
    assert customer_names == {"Acme Traders"}


@pytest.mark.asyncio
async def test_list_trips_customer_cannot_override_scope_via_argument(db_session, customer_acme_user):
    """Even if the tool argument explicitly asks for Bharat's customer_id,
    a "customer" role caller's own id always wins - this is exactly the
    kind of thing a hallucinating or adversarially-prompted LLM plan might
    try, and app.auth.models.AuthenticatedUser.effective_customer_filter
    is what stops it regardless of what the plan says.
    """
    out = await list_trips.run(
        db_session, customer_acme_user, ListTripsInput(customer_id=BHARAT_CUSTOMER_ID, limit=500)
    )
    customer_names = {t.customer_name for t in out.trips}
    assert customer_names == {"Acme Traders"}
    assert len(out.trips) > 0


@pytest.mark.asyncio
async def test_customer_trip_summary_forces_own_scope(db_session, customer_acme_user):
    out = await get_customer_trip_summary.run(
        db_session, customer_acme_user, GetCustomerTripSummaryInput(customer_id=BHARAT_CUSTOMER_ID)
    )
    assert len(out.results) == 1
    assert out.results[0].customer_name == "Acme Traders"


@pytest.mark.asyncio
async def test_unpaid_invoices_scoped_to_customer(db_session, customer_acme_user, primary_user):
    customer_out = await list_unpaid_invoices.run(db_session, customer_acme_user, ListUnpaidInvoicesInput(limit=500))
    operator_out = await list_unpaid_invoices.run(db_session, primary_user, ListUnpaidInvoicesInput(limit=500))

    customer_names = {inv.customer_name for inv in customer_out.invoices}
    assert customer_names <= {"Acme Traders"}
    operator_customer_names = {inv.customer_name for inv in operator_out.invoices}
    assert len(operator_customer_names) >= len(customer_names)
