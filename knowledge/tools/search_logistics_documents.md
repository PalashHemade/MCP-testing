---
type: tool
title: search_logistics_documents
description: Retrieves relevant passages from policy/port-regulation documents via PostgreSQL full-text search.
tags: [tool, documents, policy]
status: stable
---

# search_logistics_documents

Searches [logistics_documents](/tables/logistics_documents.md)
(tenant-private + global demo content) for passages relevant to a
natural-language `query`, optionally filtered by `documentType`,
`jurisdiction`, `effectiveDate`.

Uses PostgreSQL full-text search (`ts_rank`/`plainto_tsquery` over the
generated `content_tsv` column), falling back to deterministic keyword
overlap (`retrievalMethod='keyword_fallback'`) when full-text search
finds no lexical match - never fabricates a result or a citation. This
backend uses no embeddings/vector search at all; see docs/okf.md for why.

# Inputs

`query` (required), `documentType?`, `jurisdiction?`, `effectiveDate?`, `limit` (max 20, default 5).

# Outputs

`passages[]` (documentId, title, documentType, jurisdiction,
sourceReference, documentVersion, effectiveFrom/To, isDemoContent,
excerpt, relevanceScore), `retrievalMethod`, `foundRelevantResults`, `completeness`.

# Limitations

`foundRelevantResults=false` means no sufficiently relevant passage was
found - the caller must not invent an answer in that case. All current
content is fictional demo text, flagged via `isDemoContent=true` - see
[demo_port_policy](/policies/demo_port_policy.md).

# Example questions

"According to the applicable port policy, what documents are required for this shipment?"
