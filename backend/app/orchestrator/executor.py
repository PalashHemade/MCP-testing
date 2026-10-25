"""Controlled execution of a validated ExecutionPlan.

Independent steps (no unmet depends_on) run concurrently via
asyncio.gather; each dependency layer waits for the previous one. Each
step gets a bounded timeout and one bounded retry on a transient
(connection-level) failure - never on a validation error, which is not
transient. This is ordinary backend code, not an LLM call: no model is
consulted between tool executions.
"""
import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthenticatedUser
from app.mcp.registry import TOOL_REGISTRY
from app.planner.schemas import ExecutionPlan, ToolCall

STEP_TIMEOUT_SECONDS = 15.0
MAX_RETRIES = 1


@dataclass
class StepResult:
    step_id: str
    tool_name: str
    status: str  # "success" | "error"
    output: dict | None = None
    error: str | None = None
    duration_ms: float = 0.0


@dataclass
class ExecutionTrace:
    steps: list[StepResult] = field(default_factory=list)

    @property
    def all_succeeded(self) -> bool:
        return all(s.status == "success" for s in self.steps)

    def get(self, step_id: str) -> StepResult | None:
        for s in self.steps:
            if s.step_id == step_id:
                return s
        return None


def _resolve_reference(value: Any, results_by_step: dict[str, dict]) -> Any:
    """Resolves string arguments of the form '$result.<step_id>.<dot.path>'
    against prior step outputs. Any other value passes through unchanged.
    """
    if not isinstance(value, str) or not value.startswith("$result."):
        return value
    _, step_id, *path_parts = value.split(".")
    step_output = results_by_step.get(step_id)
    if step_output is None:
        raise ValueError(f"Cannot resolve reference '{value}': step '{step_id}' has no result")
    current: Any = step_output
    for part in path_parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            raise ValueError(f"Cannot resolve reference '{value}': path '{part}' not found")
    return current


def _resolve_arguments(arguments: dict, results_by_step: dict[str, dict]) -> dict:
    return {k: _resolve_reference(v, results_by_step) for k, v in arguments.items()}


async def _run_step(
    call: ToolCall,
    session: AsyncSession,
    user: AuthenticatedUser,
    results_by_step: dict[str, dict],
) -> StepResult:
    spec = TOOL_REGISTRY[call.tool_name]  # presence guaranteed by Planner._validate
    started = time.perf_counter()

    for attempt in range(MAX_RETRIES + 1):
        try:
            resolved_args = _resolve_arguments(call.arguments, results_by_step)
            input_data = spec.input_model.model_validate(resolved_args)
            output = await asyncio.wait_for(spec.run(session, user, input_data), timeout=STEP_TIMEOUT_SECONDS)
            duration_ms = (time.perf_counter() - started) * 1000
            return StepResult(
                step_id=call.step_id,
                tool_name=call.tool_name,
                status="success",
                output=output.model_dump(mode="json"),
                duration_ms=duration_ms,
            )
        except ValidationError as exc:
            # Not transient - never retry a bad argument.
            return StepResult(
                step_id=call.step_id, tool_name=call.tool_name, status="error",
                error=f"argument validation failed: {exc}",
                duration_ms=(time.perf_counter() - started) * 1000,
            )
        except asyncio.TimeoutError:
            if attempt < MAX_RETRIES:
                continue
            return StepResult(
                step_id=call.step_id, tool_name=call.tool_name, status="error",
                error=f"tool '{call.tool_name}' timed out after {STEP_TIMEOUT_SECONDS}s",
                duration_ms=(time.perf_counter() - started) * 1000,
            )
        except Exception as exc:  # noqa: BLE001 - surfaced as structured error, not raised
            if attempt < MAX_RETRIES:
                continue
            return StepResult(
                step_id=call.step_id, tool_name=call.tool_name, status="error",
                error=f"{type(exc).__name__}: {exc}",
                duration_ms=(time.perf_counter() - started) * 1000,
            )

    raise AssertionError("unreachable")  # pragma: no cover


async def execute_plan(
    plan: ExecutionPlan, *, session: AsyncSession, user: AuthenticatedUser
) -> ExecutionTrace:
    trace = ExecutionTrace()
    results_by_step: dict[str, dict] = {}
    remaining = list(plan.selected_tools)

    while remaining:
        ready = [c for c in remaining if all(dep in results_by_step for dep in c.depends_on)]
        if not ready:
            # Unresolvable dependency (shouldn't happen - Planner._validate
            # checks depends_on references exist) - fail remaining steps
            # explicitly rather than looping forever.
            for call in remaining:
                trace.steps.append(
                    StepResult(
                        step_id=call.step_id, tool_name=call.tool_name, status="error",
                        error="unresolvable dependency ordering",
                    )
                )
            break

        step_results = await asyncio.gather(
            *[_run_step(call, session, user, results_by_step) for call in ready]
        )
        for result in step_results:
            trace.steps.append(result)
            if result.status == "success":
                results_by_step[result.step_id] = result.output or {}

        remaining = [c for c in remaining if c not in ready]

    return trace
