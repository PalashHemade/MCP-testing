# Open Knowledge Format (OKF)

This backend uses Google's
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format)
(OKF v0.2): plain markdown files with YAML frontmatter, no embedding model,
no vector column, no ranking system anywhere in this backend. The spec was
verified against the real `GoogleCloudPlatform/open-knowledge-format`
repository (SPEC.md/README.md) before writing any bundle content, rather
than inventing frontmatter fields - the only OKF-mandated frontmatter key
is `type`; `okf_version` is optional and only meaningful on the bundle
root's `index.md`.

## The bundle

Lives at `../knowledge` (outside `backend-node/`, since it describes the
domain, not this specific backend's code) and is loaded via
`KNOWLEDGE_ROOT` in `.env`.

```
knowledge/
  index.md            root - okf_version: "0.2", links to the 4 sections below
  tables/              7 files - one per Postgres table + its own index.md
  metrics/              5 files - the financial definitions used everywhere
                        (gross_billed_amount, outstanding_balance,
                        trip_profit, profit_per_km, route_profitability)
  tools/                10 files - one per registered tool + index.md
  policies/             2 files - fictional demo port/billing policy text,
                        explicitly marked as demo content
  workflows/            3 files - multi-step question patterns that chain
                        several tools (e.g. "trip financial analysis",
                        "route comparison", "document compliance")
```

Each file is `type` + a handful of descriptive frontmatter keys (`title`,
`description`, `tags`, `status`) followed by markdown prose, cross-linked
with bundle-absolute links (`/tools/get_trip_financials.md`), per the OKF
recommendation for links that should resolve the same way regardless of
which file is reading them. `index.md`/`log.md` are OKF-reserved filenames
used here exactly as the spec intends - navigation entry points, not
content.

## What OKF supplies vs. what the code supplies

**The OKF bundle describes; it never grants.** `src/mcp/registry.ts`
remains the sole source of truth for which tools exist, their argument
schemas, and who may call them. The knowledge bundle can describe a tool
in as much prose as useful and it still can't be invoked unless it's also
registered in code - `src/scripts/validateKnowledge.ts` (`npm run
knowledge:validate`) enforces this by cross-checking every `tools/*.md`
file's name against the real `TOOL_SPECS` list and flagging any that
don't match, any broken bundle-absolute link, and any path-traversal
attempt in a link (`assertWithinRoot` in `src/knowledge/loader.ts`). The
bundle currently validates clean: **0 errors, 0 warnings**.

## How it's used at runtime

`src/knowledge/resolver.ts`:

- `resolveToolKnowledge(bundle, toolName)` - pulls the matching `tools/*.md`
  concept (plus whatever it links to) for a given tool, enforcing a
  character budget (`KNOWLEDGE_MAX_CONTEXT_CHARS`) so a request can't
  balloon the prompt arbitrarily.
- `resolveAllMetrics(bundle)` - pulls all 5 `metrics/*.md` definitions as
  one block, injected into `generateAnswer`'s prompt
  (`src/orchestrator/answer.ts`) as the *authoritative* source for what
  "profit", "profit per km", etc. mean. The final-answer system instruction
  tells the model to base every number only on the tool JSON and these
  definitions - never to recompute or reinterpret a metric on its own.

Note the split: the **planner** (`src/orchestrator/toolDiscovery.ts`) is
given each tool's own registry metadata (purpose/description/limitations/
example questions - already rich enough for tool *selection*), not the
full OKF bundle; the **answer** step is given the OKF *metric* definitions,
because that's where a wrong business-logic assumption (e.g. averaging
per-trip ratios instead of summing) would actually produce a wrong number.

## No ranking, by design

With only 10 tools (≤7 visible to any one role), `getCandidateTools(role)`
in `src/orchestrator/toolDiscovery.ts` simply returns every tool that
role may use, every time - there is no embedding similarity search, no
top-k cutoff, nothing that could silently exclude the right tool from
consideration. The project brief for this backend was explicit that this
is intentional, not a placeholder for a ranking system to be added later.

## Validating the bundle

```bash
npm run knowledge:validate
```

Run this after editing anything under `../knowledge/` - it's also run by
`src/server.ts` at startup, which **refuses to start** if the bundle has
any conformance error (a tool reference that doesn't match the registry, a
broken link, etc.), rather than serving with a silently stale or broken
knowledge bundle.
