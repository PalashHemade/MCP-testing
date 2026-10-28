---
type: metric
title: gross_billed_amount
description: freight charge + additional charges + tax amount, summed only over included invoices.
tags: [metric, money]
status: stable
---

# gross_billed_amount

```
gross_billed_amount(invoice) = freight_charge + additional_charges + tax_amount
```

# Invoice inclusion rule

When aggregating across a trip's invoices (or a customer's/route's
trips), only invoices whose `payment_status` is one of `unpaid`,
`partially_paid`, `paid` are included. `draft` (not yet finalized) and
`cancelled` (voided) invoices are **excluded** from revenue/profit, but
are still returned in [get_trip_financials](/tools/get_trip_financials.md)
output for transparency.

Billed revenue is **not** the same as cash collected or
accounting-recognized revenue - see
[outstanding_balance](/metrics/outstanding_balance.md).

A trip may have more than one invoice (see
[trip_billing](/tables/trip_billing.md)) - this sum is always over ALL of
a trip's included invoices, never just one.

# Computation

```sql
SELECT coalesce(sum(freight_charge + additional_charges + tax_amount), 0)
FROM trip_billing
WHERE trip_id = :trip_id AND payment_status IN ('unpaid', 'partially_paid', 'paid')
```
