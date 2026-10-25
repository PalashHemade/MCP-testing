"""The structured plan Gemini must produce. This schema is the ONLY
channel through which the LLM can cause backend action - it names
registered tools and validated arguments, never arbitrary code or SQL.
"""
from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    step_id: str = Field(description="Unique id for this call within the plan, e.g. 'step_1'.")
    tool_name: str = Field(description="Must be one of the registered tool names given as candidates.")
    arguments: dict = Field(default_factory=dict, description="Arguments for the tool, matching its input schema.")
    depends_on: list[str] = Field(
        default_factory=list,
        description="step_ids of other calls in this plan that must complete first (empty if independent).",
    )


class ExecutionPlan(BaseModel):
    intent: str = Field(description="Short description of what the user is asking for.")
    requested_deliverables: list[str] = Field(default_factory=list)
    filters: dict = Field(default_factory=dict, description="Extracted date range, entities, and other filters.")
    selected_tools: list[ToolCall] = Field(default_factory=list)
    expected_outputs: list[str] = Field(default_factory=list)
    authorization_requirements: list[str] = Field(default_factory=list)
    clarification_required: bool = False
    clarification_question: str | None = None
    unsupported_reason: str | None = None
