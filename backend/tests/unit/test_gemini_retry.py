import pytest
from google.genai import errors

from app.utils.gemini_retry import call_with_retry


def _api_error(code: int) -> errors.APIError:
    return errors.APIError(code, {"error": {"message": "synthetic test error"}})


@pytest.mark.asyncio
async def test_succeeds_without_retry_when_first_call_works():
    calls = []

    def fn():
        calls.append(1)
        return "ok"

    result = await call_with_retry(fn, max_retries=2, backoff_seconds=0)
    assert result == "ok"
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_retries_on_503_and_eventually_succeeds():
    attempts = {"n": 0}

    def fn():
        attempts["n"] += 1
        if attempts["n"] < 3:
            raise _api_error(503)
        return "recovered"

    result = await call_with_retry(fn, max_retries=2, backoff_seconds=0)
    assert result == "recovered"
    assert attempts["n"] == 3


@pytest.mark.asyncio
async def test_raises_after_exhausting_retries_on_persistent_503():
    attempts = {"n": 0}

    def fn():
        attempts["n"] += 1
        raise _api_error(503)

    with pytest.raises(errors.APIError) as exc_info:
        await call_with_retry(fn, max_retries=2, backoff_seconds=0)
    assert exc_info.value.code == 503
    assert attempts["n"] == 3  # initial attempt + 2 retries


@pytest.mark.asyncio
async def test_does_not_retry_permanent_404():
    attempts = {"n": 0}

    def fn():
        attempts["n"] += 1
        raise _api_error(404)

    with pytest.raises(errors.APIError) as exc_info:
        await call_with_retry(fn, max_retries=2, backoff_seconds=0)
    assert exc_info.value.code == 404
    assert attempts["n"] == 1  # no retry wasted on a permanent error


@pytest.mark.asyncio
async def test_does_not_retry_non_api_errors():
    def fn():
        raise ValueError("not a transient API error")

    with pytest.raises(ValueError):
        await call_with_retry(fn, max_retries=2, backoff_seconds=0)
