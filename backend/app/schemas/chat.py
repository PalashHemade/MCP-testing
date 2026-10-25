from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ToolExecutionSummary(BaseModel):
    step_id: str
    tool_name: str
    status: str
    duration_ms: float
    error: str | None = None
    # Full structured output of this tool call, for the frontend to render
    # as tables/citations. Safe to return as-is: it is the same
    # tenant-scoped data already authorized for this caller, never
    # another tenant's data and never raw internals/secrets.
    output: dict | None = None


class ChatResponse(BaseModel):
    request_id: str
    answer: str
    intent: str
    tool_executions: list[ToolExecutionSummary]
    retrieval_method: str
    is_fully_complete: bool
    validation_notes: list[str]
    unsupported_reason: str | None = None
    clarification_required: bool = False
