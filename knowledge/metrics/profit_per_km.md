---
type: metric
title: profit_per_km
description: trip_profit divided by distance_km - null whenever distance is missing or non-positive.
tags: [metric, money]
status: stable
---

# profit_per_km

```
profit_per_km = trip_profit / distance_km   (only when distance_km > 0)
```

Returns `null` (never an error, never a fabricated number) when:
- `distance_km` is `null` (not recorded for this trip), or
- `distance_km <= 0`, or
- `trip_profit` itself is `null` (no invoice recorded).

Never divides by zero. A trip missing distance still gets a profit
figure from [trip_profit](/metrics/trip_profit.md); it just has an
undefined per-km rate, which the caller must report as undefined rather
than omitting silently.

See [route_profitability](/metrics/route_profitability.md) for how this
generalizes to a *group* of trips (aggregate, not an average of ratios).
