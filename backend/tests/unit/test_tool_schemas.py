import pytest
from pydantic import ValidationError

from app.schemas.tools import GetDriverTripHistoryInput, GetTripDetailsInput, ListTripsInput


def test_list_trips_rejects_inverted_date_range():
    with pytest.raises(ValidationError):
        ListTripsInput(start_date="2026-03-01", end_date="2026-01-01")


def test_get_trip_details_requires_identifier():
    with pytest.raises(ValidationError):
        GetTripDetailsInput()


def test_get_trip_details_accepts_trip_number_only():
    input_data = GetTripDetailsInput(trip_number="TRIP-1001")
    assert input_data.trip_id is None


def test_driver_trip_history_requires_id_or_name():
    with pytest.raises(ValidationError):
        GetDriverTripHistoryInput()
    GetDriverTripHistoryInput(driver_name="Ramesh")


def test_list_trips_rejects_limit_over_cap():
    with pytest.raises(ValidationError):
        ListTripsInput(limit=10_000)
