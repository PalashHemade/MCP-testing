import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, get_scoped_db
from app.auth.models import AuthenticatedUser
from app.orchestrator.pipeline import run_chat_pipeline
from app.schemas.chat import ChatRequest, ChatResponse, ToolExecutionSummary

router = APIRouter(prefix="/api/v1", tags=["chat"])
logger = logging.getLogger("app.chat")


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_scoped_db),
) -> ChatResponse:
    result = await run_chat_pipeline(question=request.message, session=session, user=user)

    logger.info(
        "chat_request",
        extra={
            "request_id": result.request_id,
            "tenant_id": str(user.tenant_id),
            "selected_tools": [s.tool_name for s in result.trace.steps],
            "execution_order": [s.step_id for s in result.trace.steps],
            "step_statuses": {s.step_id: s.status for s in result.trace.steps},
            "retrieval_method": result.retrieval_method,
            "fully_complete": result.validation.fully_complete,
        },
    )

    return ChatResponse(
        request_id=result.request_id,
        answer=result.answer,
        intent=result.plan.intent,
        tool_executions=[
            ToolExecutionSummary(
                step_id=s.step_id, tool_name=s.tool_name, status=s.status,
                duration_ms=round(s.duration_ms, 1), error=s.error, output=s.output,
            )
            for s in result.trace.steps
        ],
        retrieval_method=result.retrieval_method,
        is_fully_complete=result.validation.fully_complete,
        validation_notes=result.validation.issues,
        unsupported_reason=result.plan.unsupported_reason,
        clarification_required=result.plan.clarification_required,
    )
