"""End-to-end request pipeline:
question -> tool retrieval -> Gemini (or fake) planning -> plan validation
-> controlled execution -> result validation -> grounded final answer.

This is the only path by which a chat request reaches the database - the
LLM never gets a direct connection, and every tool call it can request is
schema-validated against app.mcp.registry.TOOL_REGISTRY first.
"""
import logging
import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.orchestrator.answer import generate_answer
from app.orchestrator.executor import ExecutionTrace, execute_plan
from app.orchestrator.validator import ValidationReport, validate_trace
from app.planner.planner import PlanValidationError, Planner
from app.planner.schemas import ExecutionPlan
from app.retrieval.tool_retrieval import ToolRetrievalService

logger = logging.getLogger("app.planner")


@dataclass
class ChatResult:
    request_id: str
    answer: str
    plan: ExecutionPlan
    trace: ExecutionTrace
    validation: ValidationReport
    retrieval_method: str


async def run_chat_pipeline(
    *, question: str, session: AsyncSession, user: AuthenticatedUser, planner: Planner | None = None
) -> ChatResult:
    request_id = str(uuid.uuid4())
    planner = planner or Planner()

    retrieval = ToolRetrievalService(session)
    candidates, retrieval_method = await retrieval.get_candidates(query=question, role=user.role)

    try:
        plan = await planner.build_plan(question=question, candidate_tools=candidates, role=user.role)
    except PlanValidationError as exc:
        plan = ExecutionPlan(
            intent="Plan validation failed",
            unsupported_reason=f"The generated plan was rejected by validation: {exc}",
        )
    except Exception as exc:  # noqa: BLE001
        # Covers anything from the planner client itself - Gemini rate
        # limits/timeouts, malformed model output, transport errors, etc.
        # None of that should ever surface as a bare 500; the user gets a
        # clear "can't answer right now" instead, and the real exception is
        # logged server-side with the request id for diagnosis.
        logger.exception("planner_failed", extra={"request_id": request_id})
        plan = ExecutionPlan(
            intent="Planner call failed",
            unsupported_reason=(
                "The planning step failed unexpectedly "
                f"({type(exc).__name__}: {exc}). Please try again."
            ),
        )

    trace = await execute_plan(plan, session=session, user=user)
    report = validate_trace(trace)
    answer = await generate_answer(question=question, plan=plan, trace=trace, report=report)

    return ChatResult(
        request_id=request_id,
        answer=answer,
        plan=plan,
        trace=trace,
        validation=report,
        retrieval_method=retrieval_method,
    )
