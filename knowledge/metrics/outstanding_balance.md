---
type: metric
title: outstanding_balance
description: gross_billed_amount minus amount_paid.
tags: [metric, money]
status: stable
---

# outstanding_balance

```
outstanding_balance(invoice) = gross_billed_amount(invoice) - amount_paid
```

# is_overdue

An invoice is `isOverdue = true` only when **both**:
1. `due_date` has passed (strictly before "as of" date), **and**
2. `outstanding_balance > 0`.

An invoice that is simply unpaid but not yet past its due date is never
called overdue. A `paid`, `cancelled`, or `draft` invoice is never
overdue regardless of due_date.

See [gross_billed_amount](/metrics/gross_billed_amount.md) for the
invoice inclusion rule this builds on.
