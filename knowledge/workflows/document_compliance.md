---
type: workflow
title: document_compliance
description: Combine trip/route data with retrieved policy text for hybrid questions.
tags: [workflow, documents, hybrid]
status: stable
---

# document_compliance

A hybrid question like "which of my profitable trips need extra port
documents" needs two INDEPENDENT steps (no dependency between them,
safe to run concurrently): one trip/route tool (e.g.
[compare_route_profitability](/tools/compare_route_profitability.md) or
[list_trips](/tools/list_trips.md)) and
[search_logistics_documents](/tools/search_logistics_documents.md). The
final answer must distinguish documented policy requirements (grounded
in retrieved text) from the trip data, and must label any policy content
as fictional demo content per [demo_port_policy](/policies/demo_port_policy.md).
