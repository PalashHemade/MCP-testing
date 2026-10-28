---
type: tool
title: list_trips
description: Find trips matching status, date range, customer, vehicle, driver, or route filters.
tags: [tool, trips]
status: stable
---

# list_trips

Lists trips for the caller's tenant, optionally filtered by date range,
`tripStatus`, `customerId`, `vehicleId`, `driverId`, `origin`,
`destination`. Supports pagination.

# Inputs

`startDate?, endDate?, tripStatus?, customerId?, vehicleId?, driverId?, origin?, destination?, limit (max 500, default 50), offset`

# Outputs

`trips[]` ([TripSummary](/tables/trips.md)), `appliedFilters`, `pageInfo`, `completeness`.

# Limitations

Caps at 500 trips per page; `completeness` is `partial` whenever
`pageInfo.hasMore` is true - a truncated page is never silently treated
as exhaustive. For a "customer" role caller, always scoped to their own
`customerId` regardless of what the `customerId` argument requests.

# Example questions

"Show all trips currently in transit." / "List trips from Delhi to Mumbai in March."
