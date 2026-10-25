from datetime import date
from typing import Protocol

from pydantic import BaseModel

from app.planner.schemas import ExecutionPlan


class ToolCandidate(BaseModel):
    name: str
    purpose: str
    description: str
    input_schema: dict
    limitations: str
    example_questions: list[str]


class PlannerClient(Protocol):
    async def create_plan(
        self, *, question: str, candidate_tools: list[ToolCandidate], today: date
    ) -> ExecutionPlan: ...
