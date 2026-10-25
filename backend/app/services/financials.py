"""Business-metric calculations shared by every service/tool that touches
money. This is the SINGLE implementation of the definitions in docs/database.md
section "Financial Definitions" - nothing else in the codebase should
re-derive these numbers independently.

Invoice inclusion rule (documented limitation, see docs/database.md):
  "Billed revenue" / "gross billed amount" aggregates only include invoices
  whose payment_status is one of {unpaid, partially_paid, paid}. 'draft'
  invoices (not yet finalized/sent) and 'cancelled' invoices (voided) are
  excluded from revenue and profit calculations, but ARE still visible in
  get_trip_financials.invoices for transparency.

Multiple invoices per trip: all included invoices for a trip are summed;
expenses are fetched once per trip (not joined against invoices), so
joining to multiple invoice rows never multiplies the expense total.

Missing expense rows are NEVER treated as proof of zero actual expense -
callers get an explicit has_expense_data=False flag instead of a bare 0.
"""
from decimal import ROUND_HALF_UP, Decimal

from app.models.billing import TripBilling
from app.models.enums import PaymentStatus
from app.models.expense import TripExpense

INCLUDED_INVOICE_STATUSES = {
    PaymentStatus.UNPAID,
    PaymentStatus.PARTIALLY_PAID,
    PaymentStatus.PAID,
}

TWO_PLACES = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def gross_billed_amount(invoice: TripBilling) -> Decimal:
    return invoice.freight_charge + invoice.additional_charges + invoice.tax_amount


def outstanding_balance(invoice: TripBilling) -> Decimal:
    return gross_billed_amount(invoice) - invoice.amount_paid


def is_overdue(invoice: TripBilling, *, as_of) -> bool:
    if invoice.due_date is None:
        return False
    if invoice.payment_status in (PaymentStatus.PAID, PaymentStatus.CANCELLED, PaymentStatus.DRAFT):
        return False
    return invoice.due_date < as_of and outstanding_balance(invoice) > 0


def sum_included_invoices(invoices: list[TripBilling]) -> tuple[Decimal, Decimal, Decimal]:
    """Returns (gross_billed_amount, amount_paid, outstanding_balance),
    summed only over invoices in INCLUDED_INVOICE_STATUSES."""
    gross = Decimal("0")
    paid = Decimal("0")
    for inv in invoices:
        if inv.payment_status not in INCLUDED_INVOICE_STATUSES:
            continue
        gross += gross_billed_amount(inv)
        paid += inv.amount_paid
    return _q(gross), _q(paid), _q(gross - paid)


def sum_expenses(expenses: list[TripExpense]) -> Decimal:
    return _q(sum((e.amount for e in expenses), Decimal("0")))


def expense_breakdown(expenses: list[TripExpense]) -> dict[str, Decimal]:
    breakdown: dict[str, Decimal] = {}
    for e in expenses:
        key = e.expense_category.value
        breakdown[key] = _q(breakdown.get(key, Decimal("0")) + e.amount)
    return breakdown


def trip_profit(gross_billed: Decimal, recorded_expenses: Decimal) -> Decimal:
    return _q(gross_billed - recorded_expenses)


def profit_per_km(profit: Decimal | None, distance_km: Decimal | None) -> Decimal | None:
    """None when distance is missing or not strictly positive - never
    divides by zero and never fabricates a ratio for undefined cases."""
    if profit is None or distance_km is None or distance_km <= 0:
        return None
    return _q(profit / distance_km)
