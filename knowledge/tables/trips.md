---
type: database_table
title: trips
description: One row per shipment - the central record everything else hangs off.
tags: [schema, trips]
status: stable
---

# trips

The central operational record. Every trip belongs to exactly one tenant
and references one [customer](/tables/customers.md), one
[vehicle](/tables/vehicles.md), and one [driver](/tables/drivers.md) - all
three via composite foreign keys on `(tenant_id, *_id)`, which is what
makes "a trip from another tenant's customer" structurally impossible, not
just an application-level check.

# Schema

| Column | Type | Notes |
|---|---|---|
| trip_id | uuid | primary key |
| tenant_id | uuid | which logistics company owns this trip |
| trip_number | varchar(50) | unique per tenant, e.g. `TRIP-1001` |
| customer_id | uuid | composite FK to customers(tenant_id, customer_id) |
| vehicle_id | uuid | composite FK to vehicles(tenant_id, vehicle_id) |
| driver_id | uuid | composite FK to drivers(tenant_id, driver_id) |
| lr_number | varchar(50) | Lorry Receipt number, unique per tenant |
| origin, destination | varchar(120) | free-text place names |
| start_date | date | required |
| planned_delivery_date | date | nullable |
| actual_delivery_date | date | nullable - null means not yet delivered |
| distance_km | numeric(10,2) | nullable - see [profit_per_km](/metrics/profit_per_km.md) for what null means downstream |
| trip_status | enum | `planned`, `in_transit`, `completed`, `cancelled` |
| cargo_description | varchar(500) | nullable |

# Known limitations

- No live GPS/location tracking - `trip_status` is a static snapshot, not
  a real-time position.
- No delay/exception-reason data model - if `actual_delivery_date` is past
  `planned_delivery_date`, nothing in this schema explains why.
- A cancelled trip is NOT excluded from financial reporting - see
  [trip_profit](/metrics/trip_profit.md) for how cancelled trips are handled.

Used by tools: [list_trips](/tools/list_trips.md), [get_trip_details](/tools/get_trip_details.md),
[get_trip_financials](/tools/get_trip_financials.md), [get_trip_expenses](/tools/get_trip_expenses.md),
[get_customer_trip_summary](/tools/get_customer_trip_summary.md),
[get_vehicle_utilization](/tools/get_vehicle_utilization.md),
[get_driver_trip_history](/tools/get_driver_trip_history.md),
[compare_route_profitability](/tools/compare_route_profitability.md).
