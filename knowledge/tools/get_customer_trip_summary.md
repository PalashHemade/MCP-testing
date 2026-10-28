---
type: tool
title: get_customer_trip_summary
description: Per-customer trip counts and financials over a date range.
tags: [tool, customers, money]
status: stable
---

# get_customer_trip_summary

Aggregates trip counts (total/completed/in-transit/cancelled) and
financials (gross billed, paid, outstanding, expenses, profit) per
[customer](/tables/customers.md), optionally scoped to one `customerId`
and/or date range.

# Inputs

`customerId?`, `startDate?`, `endDate?`.

# Outputs

`results[]` (per customer: tripCount, completedCount, inTransitCount,
cancelledCount, grossBilledAmount, amountPaid, outstandingBalance,
recordedExpenses, tripProfit), `appliedFilters`, `completeness`.

# Limitations

Aggregates at most 500 trips per customer per call (demo-scale cap). For
a "customer" role caller, the `customerId` argument is ALWAYS overridden
to the caller's own id - this tool otherwise lets an operator compare
across customers, which a customer-portal login must never be able to do
by passing someone else's id.

# Example questions

"Which customer generated the most billed revenue last month?" / "Summarize my trips this quarter."
