---
type: workflow
title: route_comparison
description: A single call to compare_route_profitability, operator-only.
tags: [workflow, routes]
status: stable
---

# route_comparison

"Which route is most profitable" is answered entirely by
[compare_route_profitability](/tools/compare_route_profitability.md) in
one call - no dependent steps needed. This tool is operator-only; if the
caller is a "customer" role, this workflow does not apply at all (the
tool is never offered as a candidate).
