from datetime import date
from decimal import Decimal

from app.models.billing import TripBilling
from app.models.enums import PaymentStatus
from app.models.expense import TripExpense
from app.models.enums import ExpenseCategory
from app.services.financials import (
    gross_billed_amount,
    is_overdue,
    outstanding_balance,
    profit_per_km,
    sum_expenses,
    sum_included_invoices,
    trip_profit,
)


def make_invoice(**kwargs) -> TripBilling:
    defaults = dict(
        freight_charge=Decimal("1000"), additional_charges=Decimal("0"), tax_amount=Decimal("0"),
        amount_paid=Decimal("0"), payment_status=PaymentStatus.UNPAID, due_date=None,
    )
    defaults.update(kwargs)
    return TripBilling(**defaults)


def test_gross_billed_amount_sums_components():
    inv = make_invoice(freight_charge=Decimal("100"), additional_charges=Decimal("20"), tax_amount=Decimal("5"))
    assert gross_billed_amount(inv) == Decimal("125")


def test_outstanding_balance():
    inv = make_invoice(freight_charge=Decimal("100"), amount_paid=Decimal("40"))
    assert outstanding_balance(inv) == Decimal("60")


def test_sum_included_invoices_excludes_draft_and_cancelled():
    included = make_invoice(freight_charge=Decimal("100"), amount_paid=Decimal("100"), payment_status=PaymentStatus.PAID)
    draft = make_invoice(freight_charge=Decimal("999"), payment_status=PaymentStatus.DRAFT)
    cancelled = make_invoice(freight_charge=Decimal("999"), payment_status=PaymentStatus.CANCELLED)

    gross, paid, outstanding = sum_included_invoices([included, draft, cancelled])
    assert gross == Decimal("100.00")
    assert paid == Decimal("100.00")
    assert outstanding == Decimal("0.00")


def test_sum_included_invoices_aggregates_multiple_invoices_without_double_counting():
    inv_a = make_invoice(freight_charge=Decimal("100"), amount_paid=Decimal("100"), payment_status=PaymentStatus.PAID)
    inv_b = make_invoice(freight_charge=Decimal("50"), amount_paid=Decimal("0"), payment_status=PaymentStatus.UNPAID)
    gross, paid, outstanding = sum_included_invoices([inv_a, inv_b])
    assert gross == Decimal("150.00")
    assert paid == Decimal("100.00")
    assert outstanding == Decimal("50.00")


def test_is_overdue_requires_past_due_date_and_outstanding_balance():
    today = date(2026, 10, 24)
    overdue = make_invoice(freight_charge=Decimal("100"), amount_paid=Decimal("0"), due_date=date(2026, 10, 1))
    not_due_yet = make_invoice(freight_charge=Decimal("100"), amount_paid=Decimal("0"), due_date=date(2026, 11, 1))
    paid_off = make_invoice(
        freight_charge=Decimal("100"), amount_paid=Decimal("100"),
        due_date=date(2026, 10, 1), payment_status=PaymentStatus.PAID,
    )
    assert is_overdue(overdue, as_of=today) is True
    assert is_overdue(not_due_yet, as_of=today) is False
    assert is_overdue(paid_off, as_of=today) is False


def test_sum_expenses_sums_all_categories():
    expenses = [
        TripExpense(expense_category=ExpenseCategory.FUEL, amount=Decimal("100"), expense_date=date(2026, 1, 1)),
        TripExpense(expense_category=ExpenseCategory.TOLL, amount=Decimal("50"), expense_date=date(2026, 1, 1)),
    ]
    assert sum_expenses(expenses) == Decimal("150.00")


def test_trip_profit_can_be_negative():
    assert trip_profit(Decimal("100"), Decimal("150")) == Decimal("-50.00")


def test_profit_per_km_none_when_distance_missing_or_nonpositive():
    assert profit_per_km(Decimal("100"), None) is None
    assert profit_per_km(Decimal("100"), Decimal("0")) is None
    assert profit_per_km(None, Decimal("10")) is None


def test_profit_per_km_computes_ratio():
    assert profit_per_km(Decimal("100"), Decimal("10")) == Decimal("10.00")
