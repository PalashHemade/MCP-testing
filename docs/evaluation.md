# Testing & evaluation

```bash
cd backend
pytest                      # everything (87 tests at time of writing)
pytest tests/unit           # financial calcs, planner validation, schema validation, result validator, date parsing
pytest tests/integration    # DB-backed: tenant isolation, tool business logic, API, seed idempotency
pytest tests/evaluation     # planner evaluation set (below)
```

Integration/evaluation tests run against `DATABASE_URL` (the local
docker-compose Postgres by default), auto-seed it once per session
(`tests/conftest.py`), and wrap each test in a rolled-back transaction so
tests cannot leak writes into each other or the baseline seed data.

All 87 tests passed in the environment used to build this (Python 3.11.9,
local Postgres via `pgvector/pgvector:pg16`, no `GEMINI_API_KEY` configured).
No claim is made about a pass rate against a live Gemini API - that has not
been run in this environment, since no API key is configured.

## Planner evaluation set

`tests/evaluation/test_planner_eval.py` has 30 deterministic natural-language
cases, run through the full chat pipeline (retrieval -> plan -> validate ->
execute -> validate results) using `FakeGeminiClient` (no network, no Gemini
quota), covering:

- simple trip lookup, financial lookup, expense-only lookup
- date-filtered trip listing ("last month", "this month")
- aggregate queries (customer revenue, vehicle utilization, route profitability)
- an ambiguous driver name (`"driver Ramesh"` matches two seeded drivers) -
  asserts `ambiguous=true` is returned, never a guess
- a missing record (`TRIP-9999`) - asserts `found=false`, not an error
- a hybrid trip-data + document question
- document-only questions, including one scoped to a tenant-private policy
- two tenant-authorization-bypass phrasings - asserts `unsupported_reason` is
  set and **no tool is executed**
- a cross-tenant lookup attempt (tenant B asking for tenant A's trip by
  number) - asserts `found=false`
- two out-of-scope questions - asserts the fallback planner declines rather
  than guessing

Each case asserts: the exact set of tools selected, that every executed step
succeeded (unless the case expects not-found/ambiguous), and the
ambiguous/not-found/unsupported behavior where relevant.

### Tests are hermetic regardless of your local `.env`

`tests/conftest.py` forces `GEMINI_API_KEY` empty for the whole test session
(before any app module is imported, so `get_settings()`'s cache never sees a
real key) unless `RUN_LIVE_GEMINI_TESTS=1` is set. This means `pytest` never
makes a live Gemini call or spends quota, **even if you have a real
`GEMINI_API_KEY` configured in `backend/.env`** for actually running the app -
section 19 of the brief requires this ("keep live Gemini evaluations optional
so tests do not require network access or consume paid API quota").

### Running the same table against a real Gemini model

Not wired into CI by design. To try it manually: set both `GEMINI_API_KEY`
and `RUN_LIVE_GEMINI_TESTS=1`, then in a throwaway script construct
`Planner()` with no `client=` argument (it will pick `GeminiPlannerClient`
automatically via `get_planner_client()`) and run the same `CASES` table from
`test_planner_eval.py` - expect looser tool-selection matching to be needed,
since a real model will phrase/compose plans differently than the
deterministic fallback. Make sure `GEMINI_MODEL`/`GEMINI_EMBEDDING_MODEL` in
your `.env` name models actually available to your API key (see
"Troubleshooting" below) - an unavailable model name fails as a 404 from
Google, which the orchestrator now catches and reports as an "unsupported"
answer rather than a 500, but it still means no real plan gets produced.

## Troubleshooting a real Gemini setup

If you point this at a real `GEMINI_API_KEY` and chat requests come back as
"the planning step failed unexpectedly" or similar:

- **Check `GEMINI_MODEL` / `GEMINI_EMBEDDING_MODEL` in `backend/.env` name
  models your key actually has access to.** Google renames/retires model ids
  over time (e.g. a `404 ... is not found for API version v1beta, or is not
  supported for generateContent` means the configured `GEMINI_MODEL` doesn't
  exist for your key); list what's available with:
  ```python
  from google import genai
  for m in genai.Client(api_key="...").models.list():
      print(m.name, m.supported_actions)
  ```
  and update `.env` to a model that supports `generateContent` (for
  `GEMINI_MODEL`) or embeddings (for `GEMINI_EMBEDDING_MODEL`).
- A bad/unavailable embedding model degrades gracefully on its own
  (`retrieval_method` falls back to `keyword_only`/`keyword_fallback`) - it
  won't break chat, just tool/document discovery quality.
- A bad/unavailable **generation** model (`GEMINI_MODEL`) is more visible: the
  planner call fails, `app.orchestrator.pipeline.run_chat_pipeline` catches it
  and reports `unsupported_reason` instead of crashing (see
  `app/orchestrator/pipeline.py`), but you won't get a real plan until the
  model name is fixed.
- Server logs (`uvicorn`'s stdout) always carry the real exception under the
  `planner_failed` log entry with a request id, even though the client only
  sees the generic message.
- A `503 ... currently experiencing high demand` (or a `429` rate limit) is
  transient, not a config problem - both the planner call and every
  embedding call retry it once with backoff
  (`app.utils.gemini_retry.call_with_retry`) before giving up. If you still
  see one reach `planner_failed`, Google's model was unavailable for the
  whole retry window; just resend the question.
- **If a request seems to hang with no new log line for a long time**
  (rather than failing fast with a `503`), that used to mean an unbounded
  wait: `google-genai`'s `HttpOptions.timeout` defaults to `None`, which
  disables all HTTP timeouts on the underlying client - during a
  high-demand incident where Google's servers queue requests instead of
  rejecting them, a call could sit indefinitely with zero feedback. Both
  Gemini clients now set `http_options=types.HttpOptions(timeout=20_000)`
  (20s) explicitly (`app.planner.gemini_client.GEMINI_HTTP_TIMEOUT_MS` /
  `app.retrieval.embeddings.GEMINI_HTTP_TIMEOUT_MS`), so a stuck request
  now fails and retries within a bounded, predictable time instead.

## What is *not* claimed

- No specific numeric "accuracy" or "success rate" is claimed for the planner
  against open-ended, unseen phrasing - only that the 30 documented cases pass
  deterministically.
- The `FakeGeminiClient` is a demo/test fixture covering a bounded set of
  phrasings (see its module docstring in
  `backend/app/planner/fake_gemini_client.py`), not a general NLU system.
