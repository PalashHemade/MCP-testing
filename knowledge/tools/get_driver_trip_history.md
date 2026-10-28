---
type: tool
title: get_driver_trip_history
description: One driver's trip history, resolving by id or possibly-ambiguous name. Operator-only.
tags: [tool, drivers, operator-only]
status: stable
---

# get_driver_trip_history

Given `driverId` or `driverName`, returns that [driver](/tables/drivers.md)'s
trips. If `driverName` matches more than one driver, returns
`ambiguous=true` with the candidate list instead of guessing.

# Permissions

**Operator-only.** Driver-level data, not customer-facing.

# Inputs

`driverId?` or `driverName?` (one required), `startDate?`, `endDate?`, `limit`, `offset`.

# Outputs

`ambiguous`, `matchingDrivers[]`, `driver` (nullable), `trips[]`,
`totalRecordedDistanceKm`, `pageInfo`, `completeness`.

# Limitations

When `ambiguous=true`, no trips are returned - the caller must
disambiguate first, never guess.

# Example questions

"Show the trip history for driver Ramesh." / "How many trips has driver DRV-004 completed?"
