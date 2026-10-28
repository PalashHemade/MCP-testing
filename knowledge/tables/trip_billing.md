---
type: database_table
title: trip_billing
description: Invoices for a trip - a trip may have MORE THAN ONE invoice row.
tags: [schema, billing, money]
status: stable
---

# trip_billing

| Column | Type | Notes |
|---|---|---|
| billing_id | uuid | primary key |
| tenant_id, trip_id | uuid | composite FK to trips(tenant_id, trip_id) |
| invoice_number | varchar(50) | unique per tenant |
| freight_charge, additional_charges, tax_amount, amount_paid | numeric(12,2) | all `>= 0` |
| invoice_date, due_date | date | nullable |
| payment_status | enum | `unpaid`, `partially_paid`, `paid`, `draft`, `cancelled` |

# Important: no uniqueness on trip_id alone

A trip can have any number of invoice rows. See
[gross_billed_amount](/metrics/gross_billed_amount.md) for the exact
inclusion rule (which `payment_status` values count toward revenue) and
why joining multiple invoices never multiplies a trip's recorded
expenses (expenses are fetched independently of how many invoices exist).

An invoice is "overdue" only when `due_date` has passed **and** a balance
remains - never just because it's unpaid before its due date.
