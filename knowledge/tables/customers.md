---
type: database_table
title: customers
description: The logistics company's clients - one of them is the "customer" role in chat auth.
tags: [schema, customers]
status: stable
---

# customers

| Column | Type | Notes |
|---|---|---|
| customer_id | uuid | primary key |
| tenant_id | uuid | FK to tenants; `UNIQUE(tenant_id, customer_id)` so trips can FK against this pair |
| customer_name | varchar(255) | |
| contact_email, phone, address, city | varchar | optional contact details |

A "customer" role chat login is pinned to exactly one `customer_id` - see
[get_customer_trip_summary](/tools/get_customer_trip_summary.md) for how
that scope is enforced regardless of what argument a tool call requests.
