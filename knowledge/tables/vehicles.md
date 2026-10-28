---
type: database_table
title: vehicles
description: Trucks/trailers owned by the tenant and assigned to trips.
tags: [schema, vehicles]
status: stable
---

# vehicles

| Column | Type | Notes |
|---|---|---|
| vehicle_id | uuid | primary key |
| tenant_id | uuid | FK to tenants |
| registration_no | varchar(50) | unique per tenant |
| vehicle_type | varchar(80) | free text, e.g. "truck", "trailer" |
| capacity_tonnes | numeric(8,2) | nullable |
| vehicle_status | enum | `active`, `maintenance`, `inactive` |

# Known limitations

No availability-hours or scheduling data - see
[get_vehicle_utilization](/tools/get_vehicle_utilization.md) for why no
utilization *percentage* is ever computed, only trip counts and recorded
distance.
