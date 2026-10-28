---
type: tool
title: get_vehicle_utilization
description: Trip counts and recorded distance per vehicle over a period. Operator-only.
tags: [tool, vehicles, operator-only]
status: stable
---

# get_vehicle_utilization

For each [vehicle](/tables/vehicles.md) (or one `vehicleId`), reports
`tripCount`, `completedTripCount`, `inTransitTripCount`, and
`totalRecordedDistanceKm` over an optional date range.

# Permissions

**Operator-only.** An internal fleet metric, not customer-facing - never
offered as a candidate to a "customer" role caller, and rejected outright
if selected anyway.

# Inputs

`vehicleId?`, `startDate?`, `endDate?`.

# Outputs

`results[]`, `appliedFilters`, `completeness` (always `complete` - no pagination).

# Limitations

Never computes a utilization *percentage* or availability-hours metric -
see [vehicles](/tables/vehicles.md) known limitation: the schema has no
availability data to support one.

# Example questions

"Which vehicles completed the most trips this quarter?"
