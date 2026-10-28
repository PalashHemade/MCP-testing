---
type: metric
title: trip_profit
description: gross_billed_amount minus recorded trip expenses - null, not zero, when there is no invoice.
tags: [metric, money]
status: stable
---

# trip_profit

```
trip_profit = gross_billed_amount - recorded_trip_expenses
```

where `recorded_trip_expenses` = sum of [trip_expenses](/tables/trip_expenses.md)
rows for the trip (zero if none are recorded, but see the note below).

# Missing-data handling (do not silently invent zeros)

- If the trip has **no invoice at all**, `trip_profit` is `null`, never
  `0` - there is nothing to compute a profit from.
- If the trip has invoices but **no recorded expenses**, the computed
  profit assumes zero expense cost, but the result is flagged
  (`hasExpenseData = false`) so the caller knows this may understate true
  cost rather than being a verified zero-expense trip.
- **Cancelled trips are not excluded.** Whatever billing/expenses exist
  for a cancelled trip are still reflected in its profit - a cancelled
  trip can have a real (often negative) profit if costs were incurred
  before cancellation.
- Profit **can be negative** - this is not treated as an error condition.

See [gross_billed_amount](/metrics/gross_billed_amount.md) for the
invoice inclusion rule and [profit_per_km](/metrics/profit_per_km.md) for
the per-distance version of this metric.
