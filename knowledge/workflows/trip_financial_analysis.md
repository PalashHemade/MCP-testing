---
type: workflow
title: trip_financial_analysis
description: Resolve a trip identifier, then fetch its financials.
tags: [workflow, trips, money]
status: stable
---

# trip_financial_analysis

A question naming a trip by number (e.g. "TRIP-1001") usually needs only
[get_trip_financials](/tools/get_trip_financials.md) directly - the
`tripNumber` is already known, so no lookup step is required first.

A question identifying a trip some other way (e.g. "my most recent trip
to Mumbai") needs [list_trips](/tools/list_trips.md) first to resolve a
`tripId`, THEN [get_trip_financials](/tools/get_trip_financials.md) with
`tripId: "$result.step_1.trips[0].tripId"` depending on that first step.
