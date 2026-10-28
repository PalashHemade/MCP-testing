---
type: tool
title: list_unpaid_invoices
description: Invoices that are unpaid or partially paid, or match an explicit payment status.
tags: [tool, billing, money]
status: stable
---

# list_unpaid_invoices

Lists [trip_billing](/tables/trip_billing.md) rows with `paymentStatus`
in `{unpaid, partially_paid}` by default, or a single explicit status if
given, optionally filtered by invoice date range.

# Inputs

`startDate?, endDate?, paymentStatus?, limit (max 500, default 50), offset`.

# Outputs

`invoices[]` (billingId, invoiceNumber, tripNumber, customerName,
grossBilledAmount, amountPaid, outstandingBalance, dueDate,
paymentStatus, isOverdue), `pageInfo`, `completeness`.

# Limitations

Default scope never includes `draft` or `cancelled` invoices.
`isOverdue=true` only when due_date has passed AND a balance remains -
see [outstanding_balance](/metrics/outstanding_balance.md). Customer-role
callers see only their own invoices.

# Example questions

"Show all unpaid and partially paid invoices." / "Which invoices are overdue?"
