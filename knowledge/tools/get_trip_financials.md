---
type: tool
title: get_trip_financials
description: Billing, expenses, profit, and profit-per-km for one trip.
tags: [tool, trips, money]
status: stable
---

# get_trip_financials

Given `tripNumber` or `tripId`, returns every invoice for that trip
([trip_billing](/tables/trip_billing.md)), the
[gross_billed_amount](/metrics/gross_billed_amount.md),
[outstanding_balance](/metrics/outstanding_balance.md), recorded
expenses (with category breakdown), [trip_profit](/metrics/trip_profit.md),
and [profit_per_km](/metrics/profit_per_km.md).

# Inputs

`tripNumber?` or `tripId?` (one required).

# Outputs

`found`, `financials` (nullable: invoices[], grossBilledAmount,
amountPaid, outstandingBalance, recordedExpenses, expenseBreakdown,
tripProfit, profitPerKm, hasBillingData, hasExpenseData, notes[]),
`completeness` (always `complete` for a found trip - never paginated).

# Limitations

`tripProfit` is `null` (not `0`) when no invoice is recorded.
`profitPerKm` is `null` when distance is missing or non-positive.
Missing expense rows are flagged via `hasExpenseData=false`, never
silently treated as zero cost.

# Example questions

"What was the profit on TRIP-1001?" / "What is the profit per kilometre for TRIP-1001?"
