from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, get_scoped_db
from app.auth.models import AuthenticatedUser
from app.config import get_settings
from app.mcp.registry import TOOL_REGISTRY

router = APIRouter(prefix="/api/v1/tools", tags=["tools"])


@router.get("")
async def list_tools(user: AuthenticatedUser = Depends(get_current_user)) -> list[dict]:
    return [
        {
            "name": spec.name,
            "purpose": spec.purpose,
            "description": spec.description,
            "input_schema": spec.input_model.model_json_schema(),
            "limitations": spec.limitations,
            "permissions": spec.permissions,
            "example_questions": spec.example_questions,
        }
        for spec in TOOL_REGISTRY.values()
        if user.role in spec.allowed_roles
    ]


@router.get("/{tool_name}")
async def get_tool(tool_name: str, user: AuthenticatedUser = Depends(get_current_user)) -> dict:
    spec = TOOL_REGISTRY.get(tool_name)
    if spec is None or user.role not in spec.allowed_roles:
        # Same 404 whether the tool doesn't exist or this role just can't
        # see it - never reveal that an operator-only tool exists to a
        # customer-role caller.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown tool '{tool_name}'")
    return {
        "name": spec.name,
        "purpose": spec.purpose,
        "description": spec.description,
        "input_schema": spec.input_model.model_json_schema(),
        "prerequisites": spec.prerequisites,
        "dependencies": spec.dependencies,
        "limitations": spec.limitations,
        "permissions": spec.permissions,
        "result_semantics": spec.result_semantics,
        "example_questions": spec.example_questions,
    }


@router.post("/{tool_name}/execute")
async def execute_tool(
    tool_name: str,
    arguments: dict,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_scoped_db),
) -> dict:
    """Development/testing-only direct tool invocation, bypassing the
    planner. Still fully authenticated and tenant/customer-scoped like
    every other path into a tool's `run()` (including RLS, via
    get_scoped_db). Disabled outside development/test.
    """
    settings = get_settings()
    if settings.is_production:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Direct tool execution is disabled when APP_ENV=production.",
        )

    spec = TOOL_REGISTRY.get(tool_name)
    if spec is None or user.role not in spec.allowed_roles:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown tool '{tool_name}'")

    try:
        input_data = spec.input_model.model_validate(arguments)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    output = await spec.run(session, user, input_data)
    return output.model_dump(mode="json")
