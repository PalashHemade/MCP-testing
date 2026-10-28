---
type: database_table
title: logistics_documents
description: Policy and port-regulation documents, searched via PostgreSQL full-text search.
tags: [schema, documents, policy]
status: stable
---

# logistics_documents

| Column | Type | Notes |
|---|---|---|
| document_id | uuid | primary key |
| tenant_id | uuid, nullable | `NULL` = global/shared; non-null = that tenant's private document |
| title, document_type, jurisdiction, source_reference, document_version | | metadata |
| effective_from, effective_to | date, nullable | applicability window |
| content | text | full document body |
| is_demo_content | boolean | always `true` in this demo - see [demo_port_policy](/policies/demo_port_policy.md) |
| content_tsv | tsvector, generated | full-text search index over `content` |

[search_logistics_documents](/tools/search_logistics_documents.md) ranks
candidates with `ts_rank`/`plainto_tsquery` over `content_tsv` - there is
no embeddings column and no vector search in this backend (see
docs/okf.md for why). A tenant-private document (non-null `tenant_id`)
is never visible to another tenant, regardless of search ranking.
