from app.orchestrator.executor import ExecutionTrace, StepResult
from app.orchestrator.validator import validate_trace


def test_fully_complete_when_all_steps_succeed_and_complete():
    trace = ExecutionTrace(
        steps=[StepResult(step_id="s1", tool_name="list_trips", status="success", output={"completeness": "complete"})]
    )
    report = validate_trace(trace)
    assert report.fully_complete is True
    assert report.issues == []


def test_partial_completeness_is_flagged_not_an_error():
    trace = ExecutionTrace(
        steps=[
            StepResult(
                step_id="s1", tool_name="list_trips", status="success",
                output={"completeness": "partial", "page_info": {"returned_count": 50, "total_count": 120}},
            )
        ]
    )
    report = validate_trace(trace)
    assert report.has_errors is False
    assert report.is_partial is True
    assert report.fully_complete is False
    assert "50" in report.issues[0] and "120" in report.issues[0]


def test_step_error_is_flagged_as_error():
    trace = ExecutionTrace(
        steps=[StepResult(step_id="s1", tool_name="list_trips", status="error", error="boom")]
    )
    report = validate_trace(trace)
    assert report.has_errors is True
    assert "boom" in report.issues[0]


def test_ambiguous_driver_result_is_flagged():
    trace = ExecutionTrace(
        steps=[
            StepResult(
                step_id="s1", tool_name="get_driver_trip_history", status="success",
                output={"completeness": "unknown", "ambiguous": True},
            )
        ]
    )
    report = validate_trace(trace)
    assert report.is_unknown_completeness is True
    assert any("ambiguously" in issue for issue in report.issues)
