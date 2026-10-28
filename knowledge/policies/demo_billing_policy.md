---
type: policy
title: Primary Logistics Co Internal Expense Policy
description: FICTIONAL demo content, internal to one tenant - proves tenant-private document isolation.
tags: [policy, billing, demo, fictional, tenant-private]
status: stable
resource: /logistics_documents?title=Primary%20Logistics%20Co%20Internal%20Expense%20Policy
---

# Primary Logistics Co Internal Expense Policy

**FICTIONAL DEMO CONTENT.** Unlike [demo_port_policy](/policies/demo_port_policy.md),
this seed document has a non-null `tenant_id` - it is private to the
primary tenant and must never be returned to the secondary tenant's
callers, regardless of search ranking. Used to test tenant-document
isolation.

- jurisdiction: Internal
- documentType: procedure
- scope: tenant-private (Primary Logistics Co only)
