---
type: database_table
title: trip_expenses
description: Itemized costs per trip, by category.
tags: [schema, expenses, money]
status: stable
---

# trip_expenses

| Column | Type | Notes |
|---|---|---|
| expense_id | uuid | primary key |
| tenant_id, trip_id | uuid | composite FK to trips(tenant_id, trip_id) |
| expense_category | enum | `fuel`, `toll`, `loading`, `allowance`, `maintenance`, `other` |
| amount | numeric(12,2) | `>= 0` |
| expense_date | date | required |
| description | varchar(500) | nullable |

# Known limitation - do not treat an empty result as zero cost

A trip with no expense rows is NOT proof the trip had zero actual cost -
it may simply mean expenses have not been logged yet. Every tool
surfacing this data (`get_trip_financials`, `get_trip_expenses`) flags
this explicitly via a `hasExpenseData` boolean rather than silently
reporting a bare `0`.
