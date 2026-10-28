---
type: tool
title: compare_route_profitability
description: Compares directional routes by aggregate profit and profit-per-km. Operator-only.
tags: [tool, routes, money, operator-only]
status: stable
---

# compare_route_profitability

Groups trips by directional route (origin, destination) within an
optional date range and reports trip count, gross billed, expenses,
aggregate profit, total distance, and
[aggregate profit-per-km](/metrics/route_profitability.md).

# Permissions

**Operator-only.** Compares performance across all customers' trips on a
route - not something a single customer should see.

# Inputs

`startDate?, endDate?, origin?, destination?, minSampleSize (default 1)`.

# Outputs

`results[]` (origin, destination, tripCount, grossBilledAmount,
recordedExpenses, aggregateProfit, totalDistanceKm,
aggregateProfitPerKm, excludedBelowMinSample), `completeness`.

# Limitations

Aggregates at most 500 trips total per call. Routes are directional (see
[route_profitability](/metrics/route_profitability.md)). A route group
below `minSampleSize` is flagged, not dropped.

# Example questions

"Which route had the highest profit per kilometre this month?"
