---
type: tool
title: get_trip_expenses
description: Itemized expense entries for one trip, optionally filtered by category or date.
tags: [tool, trips, money]
status: stable
---

# get_trip_expenses

Given `tripNumber`/`tripId` and optional `expenseCategory`/date filters,
returns the matching [trip_expenses](/tables/trip_expenses.md) rows, a
category breakdown, and the total.

# Inputs

`tripNumber?`/`tripId?` (one required), `expenseCategory?`, `startDate?`, `endDate?`.

# Outputs

`found`, `tripId`, `expenses[]`, `categoryBreakdown`, `totalRecordedExpenses`, `appliedFilters`, `completeness`.

# Limitations

An empty result means no expenses are recorded, which is not proof the
trip had zero actual cost - see
[trip_expenses](/tables/trip_expenses.md) known limitation.

# Example questions

"Show fuel expenses for TRIP-1001." / "What toll costs were recorded for TRIP-1003?"
