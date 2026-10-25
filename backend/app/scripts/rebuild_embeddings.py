"""Rebuild pgvector embeddings for tool_metadata and document_chunks.

Run with: python -m app.scripts.rebuild_embeddings

Requires GEMINI_API_KEY to be configured - if it is not, this prints a
clear message and exits 0 (not an error - the rest of the system still
works via the deterministic keyword fallbacks in
app.retrieval.tool_retrieval and app.services.document_service; it simply
means retrieval_method will be 'keyword_only' / 'keyword_fallback' until
embeddings are built).
"""
import asyncio
import sys

from sqlalchemy import select

from app.config import get_settings
from app.db.admin_session import admin_session_scope as session_scope
from app.mcp.registry import TOOL_SPECS
from app.models.document import DocumentChunk
from app.models.tool_metadata import ToolMetadata
from app.retrieval.embeddings import EmbeddingUnavailableError, get_embedding_service


async def rebuild() -> None:
    settings = get_settings()
    if not settings.gemini_available:
        print(
            "GEMINI_API_KEY is not configured - skipping embedding rebuild. "
            "Tool discovery and document search will use their deterministic "
            "keyword fallbacks until this is run with a real key."
        )
        return

    embeddings = get_embedding_service()

    async with session_scope() as session:
        tool_count = 0
        for spec in TOOL_SPECS:
            row = (
                await session.execute(select(ToolMetadata).where(ToolMetadata.tool_name == spec.name))
            ).scalar_one_or_none()
            if row is None:
                print(f"Skipping '{spec.name}': no tool_metadata row (run seed_demo first).")
                continue
            corpus = f"{spec.name}. {spec.purpose} {spec.description} " + " ".join(spec.example_questions)
            try:
                row.embedding = await embeddings.embed_text(corpus, task_type="RETRIEVAL_DOCUMENT")
                tool_count += 1
            except EmbeddingUnavailableError as exc:
                print(f"Embedding failed for tool '{spec.name}': {exc}", file=sys.stderr)

        chunk_rows = list((await session.execute(select(DocumentChunk))).scalars().all())
        chunk_count = 0
        for chunk in chunk_rows:
            try:
                chunk.embedding = await embeddings.embed_text(chunk.chunk_text, task_type="RETRIEVAL_DOCUMENT")
                chunk_count += 1
            except EmbeddingUnavailableError as exc:
                print(f"Embedding failed for chunk '{chunk.chunk_id}': {exc}", file=sys.stderr)

    print(f"Rebuilt embeddings for {tool_count} tools and {chunk_count} document chunks.")


if __name__ == "__main__":
    asyncio.run(rebuild())
