from datetime import date

from app.planner.date_parsing import parse_relative_date_range


def test_last_month_crosses_year_boundary():
    start, end = parse_relative_date_range("show trips from last month", today=date(2026, 1, 15))
    assert start == date(2025, 12, 1)
    assert end == date(2025, 12, 31)


def test_this_month():
    start, end = parse_relative_date_range("this month", today=date(2026, 10, 24))
    assert start == date(2026, 10, 1)
    assert end == date(2026, 10, 31)


def test_this_quarter():
    start, end = parse_relative_date_range("this quarter", today=date(2026, 10, 24))
    assert start == date(2026, 10, 1)
    assert end == date(2026, 12, 31)


def test_last_quarter_crosses_year_boundary():
    start, end = parse_relative_date_range("last quarter", today=date(2026, 1, 10))
    assert start == date(2025, 10, 1)
    assert end == date(2025, 12, 31)


def test_explicit_iso_dates():
    start, end = parse_relative_date_range("between 2026-01-01 and 2026-01-31", today=date(2026, 10, 24))
    assert start == date(2026, 1, 1)
    assert end == date(2026, 1, 31)


def test_unrecognized_phrase_returns_none():
    start, end = parse_relative_date_range("sometime recently", today=date(2026, 10, 24))
    assert start is None
    assert end is None
