import pytest

from app.planner.base import ToolCandidate
from app.planner.planner import Planner, PlanValidationError
from app.planner.schemas import ExecutionPlan, ToolCall
from app.mcp.registry import TOOL_REGISTRY


def candidates_for(*names: str) -> list[ToolCandidate]:
    out = []
    for name in names:
        spec = TOOL_REGISTRY[name]
        out.append(
            ToolCandidate(
                name=spec.name, purpose=spec.purpose, description=spec.description,
                input_schema=spec.input_model.model_json_schema(), limitations=spec.limitations,
                example_questions=spec.example_questions,
            )
        )
    return out


class _FixedClient:
    def __init__(self, plan: ExecutionPlan):
        self._plan = plan

    async def create_plan(self, *, question, candidate_tools, today):
        return self._plan


@pytest.mark.asyncio
async def test_rejects_unregistered_tool():
    plan = ExecutionPlan(intent="test", selected_tools=[ToolCall(step_id="s1", tool_name="drop_all_tables", arguments={})])
    planner = Planner(client=_FixedClient(plan))
    with pytest.raises(PlanValidationError, match="unregistered"):
        await planner.build_plan(question="x", candidate_tools=candidates_for("list_trips"), role="operator")


@pytest.mark.asyncio
async def test_rejects_tool_not_in_retrieved_candidates():
    plan = ExecutionPlan(intent="test", selected_tools=[ToolCall(step_id="s1", tool_name="list_unpaid_invoices", arguments={})])
    planner = Planner(client=_FixedClient(plan))
    with pytest.raises(PlanValidationError, match="not offered"):
        await planner.build_plan(question="x", candidate_tools=candidates_for("list_trips"), role="operator")


@pytest.mark.asyncio
async def test_rejects_invalid_arguments():
    plan = ExecutionPlan(
        intent="test",
        selected_tools=[ToolCall(step_id="s1", tool_name="list_trips", arguments={"trip_status": "not_a_real_status"})]
    )
    planner = Planner(client=_FixedClient(plan))
    with pytest.raises(PlanValidationError, match="Invalid arguments"):
        await planner.build_plan(question="x", candidate_tools=candidates_for("list_trips"), role="operator")


@pytest.mark.asyncio
async def test_rejects_duplicate_step_ids():
    plan = ExecutionPlan(
        intent="test",
        selected_tools=[
            ToolCall(step_id="s1", tool_name="list_trips", arguments={}),
            ToolCall(step_id="s1", tool_name="list_trips", arguments={}),
        ]
    )
    planner = Planner(client=_FixedClient(plan))
    with pytest.raises(PlanValidationError, match="Duplicate step_id"):
        await planner.build_plan(question="x", candidate_tools=candidates_for("list_trips"), role="operator")


@pytest.mark.asyncio
async def test_rejects_unknown_dependency():
    plan = ExecutionPlan(
        intent="test",
        selected_tools=[ToolCall(step_id="s1", tool_name="list_trips", arguments={}, depends_on=["ghost_step"])]
    )
    planner = Planner(client=_FixedClient(plan))
    with pytest.raises(PlanValidationError, match="unknown step"):
        await planner.build_plan(question="x", candidate_tools=candidates_for("list_trips"), role="operator")


@pytest.mark.asyncio
async def test_accepts_valid_plan():
    plan = ExecutionPlan(
        intent="test",
        selected_tools=[ToolCall(step_id="s1", tool_name="list_trips", arguments={"trip_status": "in_transit"})]
    )
    planner = Planner(client=_FixedClient(plan))
    result = await planner.build_plan(question="x", candidate_tools=candidates_for("list_trips"), role="operator")
    assert result is plan


@pytest.mark.asyncio
async def test_rejects_operator_only_tool_for_customer_role():
    plan = ExecutionPlan(
        intent="test",
        selected_tools=[ToolCall(step_id="s1", tool_name="get_vehicle_utilization", arguments={})],
    )
    planner = Planner(client=_FixedClient(plan))
    with pytest.raises(PlanValidationError, match="not permitted"):
        await planner.build_plan(
            question="x", candidate_tools=candidates_for("get_vehicle_utilization"), role="customer"
        )


@pytest.mark.asyncio
async def test_allows_operator_only_tool_for_operator_role():
    plan = ExecutionPlan(
        intent="test",
        selected_tools=[ToolCall(step_id="s1", tool_name="get_vehicle_utilization", arguments={})],
    )
    planner = Planner(client=_FixedClient(plan))
    result = await planner.build_plan(
        question="x", candidate_tools=candidates_for("get_vehicle_utilization"), role="operator"
    )
    assert result is plan
