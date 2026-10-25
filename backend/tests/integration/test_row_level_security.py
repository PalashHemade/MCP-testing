"""Proves Row-Level Security is a REAL backstop, not just documentation -
these tests connect as the actual restricted app_runtime role (the same
role app.db.session.engine uses) and run queries with NO tenant/customer
WHERE clause at all. If RLS weren't actually enforced (e.g. the role were
a superuser, or FORCE ROW LEVEL SECURITY weren't set), these would return
every tenant's/customer's rows; they must not.

This is deliberately independent of app.repositories/app.services - a bug
in that code's own WHERE clauses must not be able to leak data, which is
exactly what this test proves regardless of whether the ORM layer "forgot"
to filter.
"""
import pytest
from sqlalchemy import text

from app.auth.dev_auth import TENANT_PRIMARY, TENANT_SECONDARY
from app.scripts.seed_demo import nid
from tests.conftest import set_rls_scope

CUSTOMER_ACME = nid("customer", "primary", "acme")
CUSTOMER_BHARAT = nid("customer", "primary", "bharat")


async def _trip_numbers(session, sql="SELECT trip_number FROM trips") -> set[str]:
    rows = (await session.execute(text(sql))).fetchall()
    return {r[0] for r in rows}


@pytest.mark.asyncio
async def test_no_scope_set_returns_zero_rows_fail_closed(rls_session):
    """Before set_rls_scope() is called, app.current_tenant_id is unset -
    current_setting(..., true) is NULL, so `tenant_id = NULL` is never
    true for any row. Unset scope must mean NO access, not full access.
    """
    numbers = await _trip_numbers(rls_session)
    assert numbers == set()


@pytest.mark.asyncio
async def test_operator_scope_sees_every_customer_in_tenant_but_not_other_tenant(rls_session):
    await set_rls_scope(rls_session, tenant_id=TENANT_PRIMARY, customer_id=None)
    numbers = await _trip_numbers(rls_session)
    assert "TRIP-1001" in numbers  # Acme
    assert "TRIP-1002" in numbers  # Bharat
    assert "TRIP-2001" not in numbers  # secondary tenant - must not leak across tenants either


@pytest.mark.asyncio
async def test_customer_scope_sees_only_its_own_trips_with_no_where_clause_in_the_query(rls_session):
    await set_rls_scope(rls_session, tenant_id=TENANT_PRIMARY, customer_id=CUSTOMER_ACME)
    numbers = await _trip_numbers(rls_session)  # note: literally "SELECT trip_number FROM trips"
    assert "TRIP-1001" in numbers  # Acme's own trip
    assert "TRIP-1002" not in numbers  # Bharat's trip - must not leak


@pytest.mark.asyncio
async def test_switching_customer_scope_switches_what_is_visible(rls_session):
    await set_rls_scope(rls_session, tenant_id=TENANT_PRIMARY, customer_id=CUSTOMER_BHARAT)
    numbers = await _trip_numbers(rls_session)
    assert "TRIP-1002" in numbers
    assert "TRIP-1001" not in numbers


@pytest.mark.asyncio
async def test_customer_scope_from_wrong_tenant_sees_nothing(rls_session):
    # Acme's customer_id exists only under TENANT_PRIMARY - claiming
    # TENANT_SECONDARY with it must not accidentally match anything.
    await set_rls_scope(rls_session, tenant_id=TENANT_SECONDARY, customer_id=CUSTOMER_ACME)
    numbers = await _trip_numbers(rls_session)
    assert numbers == set()


@pytest.mark.asyncio
async def test_rls_applies_to_trip_billing_via_customer_id_through_trips(rls_session):
    await set_rls_scope(rls_session, tenant_id=TENANT_PRIMARY, customer_id=CUSTOMER_ACME)
    invoice_numbers = await _trip_numbers(rls_session, "SELECT invoice_number FROM trip_billing")
    assert any(n.startswith("INV-TRIP-1001") for n in invoice_numbers)
    assert not any(n.startswith("INV-TRIP-1002") for n in invoice_numbers)


@pytest.mark.asyncio
async def test_rls_applies_to_trip_expenses_via_customer_id_through_trips(rls_session):
    await set_rls_scope(rls_session, tenant_id=TENANT_PRIMARY, customer_id=CUSTOMER_BHARAT)
    # trip_expenses has no customer_id column of its own - the policy
    # joins through trips.customer_id (see migration 0002). Join here too
    # so the assertion is about which trip each visible expense belongs
    # to, not just raw row counts.
    rows = (
        await rls_session.execute(
            text(
                "SELECT t.trip_number FROM trip_expenses e "
                "JOIN trips t ON t.trip_id = e.trip_id AND t.tenant_id = e.tenant_id"
            )
        )
    ).fetchall()
    expense_trip_numbers = {r[0] for r in rows}
    # Bharat owns TRIP-1002 (hand-crafted) plus several bulk-generated
    # trips that happen to cycle onto the same customer - assert on
    # cross-customer exclusion rather than a hardcoded single trip number.
    assert "TRIP-1002" in expense_trip_numbers
    assert "TRIP-1001" not in expense_trip_numbers  # Acme's trip
    assert "TRIP-1003" not in expense_trip_numbers  # Oceanic's trip


@pytest.mark.asyncio
async def test_app_runtime_role_cannot_bypass_via_raw_insert(rls_session):
    """app_runtime only has SELECT granted (see migration 0002) - it
    cannot write at all, regardless of RLS. Confirms the role's privilege
    boundary, not just its row visibility.
    """
    from sqlalchemy.exc import DBAPIError

    await set_rls_scope(rls_session, tenant_id=TENANT_PRIMARY, customer_id=CUSTOMER_ACME)
    with pytest.raises(DBAPIError):
        await rls_session.execute(
            text(
                "INSERT INTO trips (trip_id, tenant_id, trip_number, customer_id, vehicle_id, "
                "driver_id, lr_number, origin, destination, start_date, trip_status) "
                "VALUES (gen_random_uuid(), :t, 'HACK-1', :c, :c, :c, 'HACK', 'x', 'y', now(), 'planned')"
            ),
            {"t": str(TENANT_PRIMARY), "c": str(CUSTOMER_ACME)},
        )
    # No explicit rollback here - the rls_session fixture's own teardown
    # rolls back the outer transaction; the failed INSERT already put the
    # DBAPI-level transaction into a failed state that a second rollback
    # call would just warn about redundantly.
