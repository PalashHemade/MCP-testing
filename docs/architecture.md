# Architecture

## Components

1. **React frontend** (`frontend/`) - chat UI, calls only the FastAPI HTTP API.
2. **FastAPI HTTP API** (`backend/app/api/`, `backend/app/main.py`) - `/health`,
   `/api/v1/health/ready`, `/api/v1/chat`, `/api/v1/tools`, `/api/v1/tools/{name}`,
   `/api/v1/tools/{name}/execute` (dev/test only).
3. **Gemini planner** (`backend/app/planner/`) - turns a question + retrieved
   candidate tools into a structured, validated `ExecutionPlan`.
4. **Tool metadata registry + embedding retrieval** (`backend/app/mcp/registry.py`,
   `backend/app/retrieval/`) - the authoritative list of the 10 tools, and the
   vector/keyword search that narrows which ones are offered to the planner.
5. **MCP server** (`backend/app/mcp/server.py`) - exposes the same 10 tools over
   MCP Streamable HTTP for external MCP clients.
6. **Controlled execution orchestrator** (`backend/app/orchestrator/`) - executes
   a validated plan, respecting `depends_on` ordering, with per-step timeout/retry,
   then runs deterministic result validation and grounded answer generation.
7. **PostgreSQL repository/data-access layer** (`backend/app/repositories/`) -
   every query is parameterized and tenant-scoped.
8. **Result validation / business-metric layer** (`backend/app/services/financials.py`,
   `backend/app/orchestrator/validator.py`).
9. **Document retrieval service** (`backend/app/services/document_service.py`).
10. **Auth/authorization layer** (`backend/app/auth/`).
11. **Alembic migrations + seed** (`backend/alembic/`, `backend/app/scripts/`).
12. **Tests** (`backend/tests/`).

## Why the orchestrator calls tools in-process (and the MCP server also exists)

`app.orchestrator.executor` calls each tool's `run(session, user, input_data)`
coroutine **directly**, in the same process as the FastAPI app - it does not go
over the MCP wire protocol for the chat path. This keeps the demo's main path
simple and avoids an unnecessary network hop for every chat request.

`app.mcp.server` is a **separate, standalone process** that registers the exact
same `run()` functions (via `app.mcp.registry.TOOL_SPECS`) as MCP tools over
Streamable HTTP, so any external MCP-aware client (not just this app's own
frontend) can call them too. There is only one implementation of each tool's
logic; the MCP server is a second, thin transport over it, not a second
implementation. Do not expose it to the public internet un-authenticated - see
[security.md](security.md) for the documented simplification in how it resolves
tenant identity.

## Request flow (detail)

```
POST /api/v1/chat {message}
  -> app.auth.dependencies.get_current_user         # resolves AuthenticatedUser (tenant_id) from X-Demo-User
  -> app.orchestrator.pipeline.run_chat_pipeline
       -> app.retrieval.tool_retrieval.ToolRetrievalService.get_candidates
            # pgvector cosine similarity over tool_metadata.embedding when
            # GEMINI_API_KEY is set and embeddings have been built; otherwise
            # (or if no embedded rows exist yet) a deterministic keyword
            # ranking over the in-memory TOOL_SPECS - retrieval_method is
            # always reported so this is never silently hidden
       -> app.planner.planner.Planner.build_plan
            -> GeminiPlannerClient.create_plan   (if GEMINI_API_KEY set)
               | FakeGeminiClient.create_plan    (otherwise - also always used in tests)
               # the Gemini call itself (and every Gemini embedding call)
               # goes through app.utils.gemini_retry.call_with_retry: up to
               # 2 retries with linear backoff on 429/5xx (rate limits,
               # transient "high demand" 503s), but a 400/404 (malformed
               # request, unknown model name) fails immediately - retrying
               # a permanent error would just burn quota
            -> Planner._validate                  # rejects unregistered tools,
                                                    # tools not among retrieved
                                                    # candidates, invalid
                                                    # arguments, bad step graphs
       -> app.orchestrator.executor.execute_plan
            # runs independent steps concurrently via asyncio.gather, waits
            # for depends_on, bounded timeout (15s) + 1 retry per step,
            # arguments may reference prior results via "$result.<step>.<path>"
       -> app.orchestrator.validator.validate_trace
            # ordinary backend code: flags errors, partial/unknown
            # completeness, not-found, ambiguous results - no LLM call here
       -> app.orchestrator.answer.generate_answer
            # Gemini call grounded ONLY in the JSON tool results above, or a
            # deterministic template fallback when GEMINI_API_KEY is unset
  -> ChatResponse {answer, tool_executions[], retrieval_method, is_fully_complete, ...}
```

## Planner output contract

`app.planner.schemas.ExecutionPlan` is the only channel through which the LLM
can cause backend action: `intent`, `requested_deliverables`, `filters`,
`selected_tools` (each a `ToolCall{step_id, tool_name, arguments, depends_on}`),
`expected_outputs`, `authorization_requirements`, `clarification_required`,
`clarification_question`, `unsupported_reason`. The LLM never generates SQL or
executable code, and every `tool_name`/`arguments` pair is re-validated against
`app.mcp.registry.TOOL_REGISTRY` before anything runs (`Planner._validate`).

## What happens with no `GEMINI_API_KEY`

Nothing silently "fakes" success. `app.config.Settings.gemini_available` is
`False`, and:

- `EmbeddingService.embed_text` raises `EmbeddingUnavailableError` rather than
  returning a meaningless vector - callers catch it and report
  `retrieval_method="keyword_only"` (tools) or `"keyword_fallback"` (documents).
- The planner uses `FakeGeminiClient`, a small deterministic rule engine - see
  its module docstring and [evaluation.md](evaluation.md) for what it covers.
- Final-answer generation falls back to a template that only echoes already-
  validated tool JSON, with a note that a real answer needs a Gemini key.
