"""Bounded retry with backoff for transient Gemini API failures.

Shared by app.planner.gemini_client (planning) and app.retrieval.embeddings
(embeddings) - both are single synchronous SDK calls wrapped in an async
def, so the retry loop itself is plain asyncio.sleep backoff, not a
scheduler. Only retries errors that are actually transient (rate limits,
5xx); a 404 model-not-found or a malformed-request 400 is permanent and
must fail immediately rather than burn quota retrying something that will
never succeed.
"""
import asyncio
from typing import Callable, TypeVar

from google.genai import errors as genai_errors

T = TypeVar("T")

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
# Each attempt is itself capped by GEMINI_HTTP_TIMEOUT_MS (see
# app.planner.gemini_client / app.retrieval.embeddings), so worst case
# here is bounded at roughly (max_retries + 1) * that per-call timeout
# plus backoff - kept at 1 retry (not more) so a sustained outage still
# fails back to the user in well under a minute rather than piling up
# several ~20s timeouts in a row.
DEFAULT_MAX_RETRIES = 1
DEFAULT_BACKOFF_SECONDS = 1.5


async def call_with_retry(
    fn: Callable[[], T],
    *,
    max_retries: int = DEFAULT_MAX_RETRIES,
    backoff_seconds: float = DEFAULT_BACKOFF_SECONDS,
) -> T:
    """Calls the zero-arg `fn` (typically a lambda wrapping a blocking
    google-genai SDK call), retrying on rate limits/5xx with linear
    backoff. Re-raises immediately on any other error, including other
    APIError codes (e.g. 400/404 - permanent, not worth retrying).
    """
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except genai_errors.APIError as exc:
            last_exc = exc
            if exc.code not in RETRYABLE_STATUS_CODES or attempt >= max_retries:
                raise
            await asyncio.sleep(backoff_seconds * (attempt + 1))
    # Unreachable: the last iteration always has attempt >= max_retries,
    # so the loop above always either returns or raises before falling
    # through here. The assert both documents that and narrows last_exc
    # from Exception | None to Exception for the type checker, which
    # can't otherwise prove `raise last_exc` is never raising None.
    assert last_exc is not None  # pragma: no cover
    raise last_exc  # pragma: no cover
