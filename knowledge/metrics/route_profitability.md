---
type: metric
title: route_profitability
description: Aggregate profit-per-km for a directional route group - sum of profits over sum of distances, never an average of ratios.
tags: [metric, money, routes]
status: stable
---

# route_profitability (aggregate profit per km)

For a group of trips sharing the same directional route (origin ->
destination):

```
aggregate_profit_per_km = sum(trip_profit for trips in group) / sum(distance_km for trips in group)
```

**This is not the average of each trip's individual
[profit_per_km](/metrics/profit_per_km.md) ratio.** Averaging individual
ratios would incorrectly weight a short, high-margin trip the same as a
long, low-margin one; dividing summed profit by summed distance weights
by actual distance traveled, which is the economically meaningful
comparison.

# Directionality

Routes are directional: Mumbai -> Delhi and Delhi -> Mumbai are two
separate groups, never merged.

# Sample size

A route group below the caller's requested minimum sample size is still
returned (not silently dropped), flagged via `excludedBelowMinSample`,
with `aggregateProfitPerKm = null` - a thin sample is not statistically
meaningful for "which route is most profitable" but is still disclosed.

Used by [compare_route_profitability](/tools/compare_route_profitability.md)
(operator-only).
