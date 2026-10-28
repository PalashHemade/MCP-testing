---
okf_version: "0.2"
---

# Logistics AI Chatbot - Knowledge Bundle

Describes the database entities, business metrics, registered tools, demo
policy documents, and operational workflows behind the logistics chatbot
backend (`backend-node/`). This bundle is OKF v0.2
(https://github.com/GoogleCloudPlatform/open-knowledge-format): markdown
files with YAML frontmatter, navigated via these index files.

The executable TypeScript tool registry (`backend-node/src/mcp/registry.ts`)
remains authoritative for available capabilities, argument schemas,
permissions, and execution - this bundle describes those capabilities, it
cannot grant execution permission.

- [Database tables](/tables/index.md) - the 7 Postgres tables backing the chatbot
- [Business metrics](/metrics/index.md) - the 5 financial definitions used everywhere
- [Registered tools](/tools/index.md) - the 10 MCP tools, 3 of them operator-only
- [Demo policy documents](/policies/index.md) - fictional port/billing policy, marked as such
- [Workflows](/workflows/index.md) - multi-step question patterns that chain several tools
