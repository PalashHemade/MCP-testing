# Testing & Evaluation

```bash
npm test          # vitest run - 10 files, 107 tests, ~10s, no network required
npm run test:watch
```

`vitest.config.ts` forces `GEMINI_API_KEY=""` for the whole suite via
`test.env` (not a `process.env` mutation in `globalSetup`, which Vitest
doesn't reliably propagate to worker threads) - every test, including the
evaluation suite below, runs against the deterministic `FakePlannerClient`,
never against a live model. `tests/globalSetup.ts` seeds the database once
before the run via the real `db:seed` script.

## Test layout

```
tests/unit/
  financials.test.ts         Decimal-safe money math: gross/outstanding/
                              profit/profit-per-km, including the null-not-
                              zero rules
  dateParsing.test.ts         relative date-range parsing ("last month",
                              "this quarter", ...), including the UTC-vs-
                              local-getter bug caught during the port (see
                              migration-from-fastapi.md)
  plannerValidation.test.ts   Planner.validate's hard gates in isolation -
                              unregistered tool, wrong role, not-a-candidate,
                              bad arguments, duplicate/unknown step ids
  okfLoader.test.ts           OKF bundle loading/validation, including
                              path-traversal rejection on a malicious link

tests/integration/
  api.test.ts                  the Express app end-to-end via real HTTP
                              (health, auth required, chat happy path,
                              role-based tool visibility/execution)
  tripTools.test.ts            each of the 10 tools against the seeded data
  tenantIsolation.test.ts      an operator never sees the other tenant's rows
  customerScoping.test.ts      a customer role never sees another customer's
                              rows, even when it tries to ask for one by id

tests/security/
  rowLevelSecurity.test.ts     proves RLS with raw SQL and no WHERE clause,
                              connected as the real restricted role - see
                              security.md

tests/evaluation/
  plannerEval.test.ts           33 documented question -> expected-tool(s)
                              cases, run through the full pipeline (tool
                              discovery -> FakePlannerClient -> validate ->
                              execute -> result validation)
```

## What the planner evaluation set actually proves (and doesn't)

`plannerEval.test.ts` is a regression lock on the **deterministic offline
planner's** behavior - the exact code path that runs whenever
`GEMINI_API_KEY` is unset, which is every test run and, by default, every
real demo session that hasn't configured a key (see
[tools.md](tools.md) "The offline fallback planner"). It is explicitly
**not** a claim about accuracy against open-ended real-world phrasing fed
to the real Gemini planner - there's no automated eval against a live model
in this repository, because that would require a paid API key and network
access in CI, and would be non-deterministic.

The 33 cases cover: simple single-trip lookups, financial lookups, trip
listing with relative date filters, unpaid-invoice queries, the three
aggregate/operator-only tools, driver-name ambiguity (returns candidates,
not a guess), document-only questions, a hybrid two-tool question, a
missing trip number, a cross-tenant trip-number guess, two tenant-bypass-
attempt phrasings, two out-of-scope questions (should both come back
`unsupportedReason`, not a hallucinated answer) - and three precision
regression cases added while hardening the fake planner (see
[tools.md](tools.md) and [migration-from-fastapi.md](migration-from-fastapi.md)
for the bug they lock in: a named trip must resolve to exactly its
single-trip tool, not an extra fleet/driver/customer-aggregate call
triggered by an incidental keyword).

### Verifying real-Gemini accuracy manually

If you do have a `GEMINI_API_KEY`, the fastest way to sanity-check the live
planner against a batch of the same questions is to boot the server
(`npx tsx src/server.ts`) and curl `/api/v1/chat` for each one, inspecting
`tool_executions[].tool_name` in the response against what you'd expect -
exactly how business-logic parity with the (since-decommissioned) Python
implementation was verified during the original port (same trip numbers,
byte-identical financial outputs). There is deliberately no committed eval
harness that spends real API quota on every CI run.

## Business-logic parity verified during the original port

This backend was built as a port of an earlier Python/FastAPI
implementation of the same chatbot, since fully decommissioned and
removed - this backend is now the only one and the sole source of truth.
Parity was verified directly during that port, not just asserted: booting
both backends against their respective seeded databases and diffing tool
output for the same trip numbers gave byte-identical financial figures
(e.g. `TRIP-1001 profit=41000.00 perKm=29.29` in both). The UUID
*algorithm* was verified byte-identical between `uuidv5` (Node) and
`uuid.uuid5` (Python) for the same string input - not every seeded
entity's actual UUID *value* matched across the two, though; see
[database.md](database.md) "Deterministic IDs" for exactly which ids do
and which don't, and why.
