from datetime import date

from pydantic import ValidationError

from app.config import get_settings
from app.mcp.registry import TOOL_REGISTRY
from app.planner.base import PlannerClient, ToolCandidate
from app.planner.fake_gemini_client import FakeGeminiClient
from app.planner.gemini_client import GeminiPlannerClient
from app.planner.schemas import ExecutionPlan


class PlanValidationError(Exception):
    pass


def get_planner_client() -> PlannerClient:
    settings = get_settings()
    if settings.gemini_available:
        return GeminiPlannerClient()
    return FakeGeminiClient()


class Planner:
    """Produces and validates an ExecutionPlan. Validation here is what
    actually prevents the LLM from invoking unregistered tools or passing
    malformed arguments - the planner client's output is never trusted on
    its own.
    """

    def __init__(self, client: PlannerClient | None = None):
        self.client = client or get_planner_client()

    async def build_plan(
        self,
        *,
        question: str,
        candidate_tools: list[ToolCandidate],
        role: str,
        today: date | None = None,
    ) -> ExecutionPlan:
        plan = await self.client.create_plan(
            question=question, candidate_tools=candidate_tools, today=today or date.today()
        )
        self._validate(plan, candidate_tools, role=role)
        return plan

    def _validate(self, plan: ExecutionPlan, candidate_tools: list[ToolCandidate], *, role: str) -> None:
        candidate_names = {c.name for c in candidate_tools}
        seen_steps: set[str] = set()

        for call in plan.selected_tools:
            spec = TOOL_REGISTRY.get(call.tool_name)
            if spec is None:
                raise PlanValidationError(f"Plan selected an unregistered tool: '{call.tool_name}'")
            if role not in spec.allowed_roles:
                # Hard gate, independent of retrieval - a role mismatch
                # here means retrieval candidate filtering was bypassed or
                # buggy, not that the plan gets a pass because it "found"
                # the tool some other way.
                raise PlanValidationError(
                    f"Role '{role}' is not permitted to use tool '{call.tool_name}'"
                )
            if call.tool_name not in candidate_names:
                raise PlanValidationError(
                    f"Plan selected '{call.tool_name}', which was not offered as a retrieved candidate"
                )
            try:
                spec.input_model.model_validate(call.arguments)
            except ValidationError as exc:
                raise PlanValidationError(f"Invalid arguments for tool '{call.tool_name}': {exc}") from exc
            if call.step_id in seen_steps:
                raise PlanValidationError(f"Duplicate step_id in plan: '{call.step_id}'")
            seen_steps.add(call.step_id)

        for call in plan.selected_tools:
            for dep in call.depends_on:
                if dep not in seen_steps:
                    raise PlanValidationError(
                        f"Step '{call.step_id}' depends_on unknown step '{dep}'"
                    )
                if dep == call.step_id:
                    raise PlanValidationError(f"Step '{call.step_id}' cannot depend on itself")
