import pytest

from app.retrieval.tool_retrieval import ToolRetrievalService


@pytest.mark.asyncio
async def test_customer_role_never_offered_operator_only_tools(db_session):
    service = ToolRetrievalService(db_session)
    candidates, _method = await service.get_candidates(
        query="Which vehicles completed the most trips this quarter?", role="customer", top_k=10
    )
    names = {c.name for c in candidates}
    assert "get_vehicle_utilization" not in names
    assert "get_driver_trip_history" not in names
    assert "compare_route_profitability" not in names


@pytest.mark.asyncio
async def test_operator_role_can_be_offered_operator_only_tools(db_session):
    service = ToolRetrievalService(db_session)
    candidates, _method = await service.get_candidates(
        query="Which vehicles completed the most trips this quarter?", role="operator", top_k=10
    )
    names = {c.name for c in candidates}
    assert "get_vehicle_utilization" in names


@pytest.mark.asyncio
async def test_customer_role_still_offered_trip_tools(db_session):
    service = ToolRetrievalService(db_session)
    candidates, _method = await service.get_candidates(
        query="What was the profit on TRIP-1001?", role="customer", top_k=10
    )
    names = {c.name for c in candidates}
    assert "get_trip_financials" in names
