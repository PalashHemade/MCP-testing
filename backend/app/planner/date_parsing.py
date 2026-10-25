import calendar
import re
from datetime import date


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _quarter_bounds(year: int, quarter: int) -> tuple[date, date]:
    start_month = (quarter - 1) * 3 + 1
    start = date(year, start_month, 1)
    end_month = start_month + 2
    _, end_day = calendar.monthrange(year, end_month)
    return start, date(year, end_month, end_day)


def parse_relative_date_range(text: str, *, today: date) -> tuple[date | None, date | None]:
    """Deterministic extraction of common relative date phrases. Returns
    (None, None) when nothing recognized rather than guessing a range.
    """
    lowered = text.lower()

    if "last month" in lowered:
        year, month = today.year, today.month - 1
        if month == 0:
            year, month = year - 1, 12
        return _month_bounds(year, month)

    if "this month" in lowered:
        return _month_bounds(today.year, today.month)

    if "this quarter" in lowered:
        quarter = (today.month - 1) // 3 + 1
        return _quarter_bounds(today.year, quarter)

    if "last quarter" in lowered:
        quarter = (today.month - 1) // 3 + 1
        year = today.year
        quarter -= 1
        if quarter == 0:
            quarter, year = 4, year - 1
        return _quarter_bounds(year, quarter)

    if "this year" in lowered:
        return date(today.year, 1, 1), date(today.year, 12, 31)

    iso_dates = re.findall(r"\d{4}-\d{2}-\d{2}", text)
    if len(iso_dates) >= 2:
        return date.fromisoformat(iso_dates[0]), date.fromisoformat(iso_dates[1])

    return None, None
