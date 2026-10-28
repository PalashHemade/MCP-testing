# Registered Tools

10 tools, matching `backend-node/src/mcp/registry.ts` exactly - this
index is a map, not the authority; the TypeScript registry grants
execution, these files only describe it.

Customer + operator accessible:
- [list_trips](/tools/list_trips.md)
- [get_trip_details](/tools/get_trip_details.md)
- [get_trip_financials](/tools/get_trip_financials.md)
- [get_trip_expenses](/tools/get_trip_expenses.md)
- [get_customer_trip_summary](/tools/get_customer_trip_summary.md)
- [list_unpaid_invoices](/tools/list_unpaid_invoices.md)
- [search_logistics_documents](/tools/search_logistics_documents.md)

Operator-only (internal fleet/ops data, never offered to a customer login):
- [get_vehicle_utilization](/tools/get_vehicle_utilization.md)
- [get_driver_trip_history](/tools/get_driver_trip_history.md)
- [compare_route_profitability](/tools/compare_route_profitability.md)
