# Tools

10 tools, one implementation each, registered in `src/mcp/registry.ts`
(`TOOL_SPECS`/`TOOL_REGISTRY`) - the single source of truth for every tool's
name, Zod input/output schema, role permissions, and `run()` function. Both
the Express chat pipeline and the standalone MCP server call into this exact
registry; there is no second copy of any tool's logic.

All 10 are read-only. 7 are available to both `operator` and `customer`
roles; 3 are `operator`-only (internal fleet/driver/cross-customer data a
customer should never see - enforced in three independent places, see
[security.md](security.md)).

| Tool | Roles | Purpose |
|---|---|---|
| `list_trips` | operator, customer | Find trips matching filters (status, dates, customer, vehicle, driver, origin/destination). Paginated, caps at 500/page. |
| `get_trip_details` | operator, customer | Full operational record for exactly one trip (by `tripNumber` or `tripId`). |
| `get_trip_financials` | operator, customer | One trip's invoices, `grossBilledAmount`, `outstandingBalance`, expenses, `tripProfit`, `profitPerKm`. |
| `get_trip_expenses` | operator, customer | Itemized expense entries for one trip, optionally filtered by category/date. |
| `get_customer_trip_summary` | operator, customer | Aggregate trip counts + financials per customer over a period; a customer-role caller always gets only their own summary regardless of `customerId`. |
| `list_unpaid_invoices` | operator, customer | Invoices with `paymentStatus` in `{unpaid, partially_paid}` by default, or an explicit status. |
| `get_vehicle_utilization` | **operator only** | Per-vehicle trip counts + recorded distance. Never computes a utilization percentage. |
| `get_driver_trip_history` | **operator only** | One driver's trips, by id or name; an ambiguous name returns candidates, never a guess. |
| `compare_route_profitability` | **operator only** | Routes compared by aggregate profit and profit-per-km (`sum(profit)/sum(distance)`, never an average of per-trip ratios); crosses customer boundaries, which is exactly why it's operator-only. |
| `search_logistics_documents` | operator, customer | Full-text search over tenant-private + global policy/regulation documents (see [database.md](database.md)). `foundRelevantResults=false` means no match - the final-answer step is instructed to never invent one. |

Full per-tool detail (inputs, outputs, limitations, example questions) lives
in the OKF knowledge bundle at `../knowledge/tools/*.md` - see
[okf.md](okf.md) for how that's structured and resolved, and why it's
markdown instead of a second code comment block.

## Tool selection: how a question becomes a tool call, and why it should be right

```
question -> getCandidateTools(role)     every tool this role may use, every
                                         single time - no embeddings, no
                                         ranking (see okf.md)
         -> Planner.buildPlan           Gemini (or FakePlannerClient
                                         offline) proposes an ExecutionPlan
         -> Planner.validate            HARD gate, independent of the model:
                                           - tool name must be registered
                                           - role must be allowed to use it
                                           - tool must have been one of the
                                             offered candidates
                                           - arguments must pass that tool's
                                             own Zod schema
                                           - stepIds unique, dependsOn must
                                             reference real, earlier steps
```

A plan that fails validation never reaches the database; it becomes a
graceful "I can't answer that" rather than a 500 (see
[security.md](security.md) "Timeouts and graceful degradation"). This gate
is what actually prevents a bad or adversarial model response from doing
anything - not instruction-following, and it's re-checked exactly the same
way regardless of which planner produced the plan.

### Disambiguation rules given to the real (Gemini) planner

Several tools return overlapping-looking data for a trip, which is exactly
where a planner can confidently pick the *wrong* one. `src/planner/
geminiClient.ts`'s system instruction spells out the specific confusions to
avoid - e.g. a question naming one `tripNumber` should resolve to
`get_trip_details`/`get_trip_financials`/`get_trip_expenses` depending on
*what* was asked, never to `list_trips`; "profit" for one trip is always
`get_trip_financials`, never `get_trip_expenses` (which has no profit
figure); aggregate performance across a customer's trips is
`get_customer_trip_summary`, not N calls to `get_trip_financials`; and so
on for the vehicle/driver/route tools. See that file for the full list.

### The offline fallback planner (`FakePlannerClient`)

Whenever `GEMINI_API_KEY` is unset - which includes every automated test,
and will be true for anyone running this demo without configuring a key -
`src/planner/planner.ts`'s `getPlannerClient()` returns
`FakePlannerClient` (`src/planner/fakePlannerClient.ts`) instead of calling
Gemini at all. It's a small, deterministic keyword/pattern engine, not a
model: it covers the demo's example questions and the 33-case evaluation
set in `tests/evaluation/plannerEval.test.ts`, and **declines** (sets
`unsupportedReason`) rather than guessing outside that coverage. Because
this is the planner that actually runs by default, its precision matters
for real usage today, not just for CI:

- Once a question names a specific trip, only that trip's single-trip tool
  fires - the fleet/driver/customer-aggregate branches are all gated on "no
  trip number present," so a stray word like "vehicle" or "driver" inside a
  single-trip question (e.g. *"Who was the driver for TRIP-1001?"*) can't
  also bolt on an irrelevant second tool call. This was a real bug (fixed
  during this work): before the gate, that exact question triggered both
  `get_trip_details` *and* a spurious `get_driver_trip_history` call with a
  garbled driver-name argument scraped from "...for TRIP" by the naive
  name-matching regex.
- `tests/evaluation/plannerEval.test.ts` has explicit regression cases for
  this ("Who was the driver for TRIP-1001?", "Which vehicle was used for
  TRIP-1002?", "Which customer does TRIP-1001 belong to?" all resolve to
  `get_trip_details` alone).

Configuring a real `GEMINI_API_KEY` is what gives you accuracy on
open-ended phrasing outside this fixed pattern set - the fake planner is a
deliberately narrow, honest stand-in, not a claim of general accuracy (see
the comment at the top of `plannerEval.test.ts`).

## Execution: timeouts, retries, and dependent steps

`src/orchestrator/executor.ts` runs independent plan steps concurrently via
`Promise.all`, and dependent steps (`dependsOn`) in layers, resolving
`$result.stepId.path` references between them. Each step gets a 15s
timeout and one bounded retry - except a Zod validation failure, which is
never retried, since retrying identical bad arguments can't succeed. See
[security.md](security.md) for exactly what the caller sees when a step
fails, times out, or the database itself is unavailable.
