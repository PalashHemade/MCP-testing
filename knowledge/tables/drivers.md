---
type: database_table
title: drivers
description: Drivers assigned to trips. Operator-only data - never exposed to a customer login.
tags: [schema, drivers]
status: stable
---

# drivers

| Column | Type | Notes |
|---|---|---|
| driver_id | uuid | primary key |
| tenant_id | uuid | FK to tenants |
| driver_name | varchar(255) | |
| phone | varchar(50) | nullable |
| licence_number | varchar(80) | unique per tenant |
| driver_status | enum | `active`, `inactive` |

[get_driver_trip_history](/tools/get_driver_trip_history.md) is the only
tool touching this table, and it is operator-only: a customer-portal
login never sees driver-level data, matching the brief's framing that a
customer "doesn't concern themselves with whose job it is to drive."
Driver-name lookups can be ambiguous (two drivers sharing a first name) -
the tool returns the candidate list rather than guessing.
