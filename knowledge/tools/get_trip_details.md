---
type: tool
title: get_trip_details
description: Full operational record for exactly one trip, by number or id.
tags: [tool, trips]
status: stable
---

# get_trip_details

Looks up one [trip](/tables/trips.md) by `tripNumber` or `tripId` and
returns customer, vehicle, driver, LR number, route, dates, status.

# Inputs

`tripNumber?` or `tripId?` (one required).

# Outputs

`found: boolean`, `trip` (TripDetail, nullable), `completeness` (always `complete`).

# Limitations

`found=false` is returned identically whether the trip doesn't exist at
all, belongs to another tenant, or (for a "customer" caller) belongs to
a different customer within the same tenant - the caller never learns
which, so a wrong guess can't be used to probe for other tenants'/
customers' data.

# Example questions

"Show me the details of TRIP-1001." / "What is the LR number for TRIP-1002?"
