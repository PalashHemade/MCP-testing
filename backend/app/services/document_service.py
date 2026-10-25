import re
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import DocumentChunk, LogisticsDocument
from app.models.enums import DocumentType
from app.repositories.documents import DocumentRepository
from app.retrieval.embeddings import EmbeddingUnavailableError, get_embedding_service
from app.schemas.domain import DocumentPassage

_WORD_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> set[str]:
    return set(_WORD_RE.findall(text.lower()))


class DocumentService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.documents = DocumentRepository(session)
        self.embeddings = get_embedding_service()

    async def search(
        self,
        *,
        tenant_id: UUID,
        query: str,
        document_type: DocumentType | None,
        jurisdiction: str | None,
        effective_date: date | None,
        limit: int,
    ) -> tuple[list[DocumentPassage], str]:
        candidates = await self.documents.search_candidates(
            tenant_id=tenant_id,
            document_type=document_type,
            jurisdiction=jurisdiction,
            effective_date=effective_date,
        )
        if not candidates:
            return [], "no_candidate_documents"

        candidate_ids = [d.document_id for d in candidates]
        docs_by_id = {d.document_id: d for d in candidates}

        try:
            query_embedding = await self.embeddings.embed_text(query, task_type="RETRIEVAL_QUERY")
        except EmbeddingUnavailableError:
            return self._keyword_fallback(query, candidates, limit), "keyword_fallback"

        stmt = (
            select(
                DocumentChunk,
                DocumentChunk.embedding.cosine_distance(query_embedding).label("distance"),
            )
            .where(
                DocumentChunk.document_id.in_(candidate_ids),
                DocumentChunk.embedding.is_not(None),
            )
            .order_by("distance")
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).all()
        if not rows:
            # Candidate documents exist but have no embedded chunks yet
            # (e.g. embeddings were never built) - fall back rather than
            # claiming an empty vector search means "no relevant content".
            return self._keyword_fallback(query, candidates, limit), "keyword_fallback_no_embeddings"

        passages = []
        for chunk, distance in rows:
            doc = docs_by_id[chunk.document_id]
            relevance = max(0.0, 1.0 - float(distance) / 2.0)  # cosine distance in [0,2] -> score in [0,1]
            passages.append(self._to_passage(doc, chunk.chunk_text, relevance))
        return passages, "vector_similarity"

    def _keyword_fallback(
        self, query: str, candidates: list[LogisticsDocument], limit: int
    ) -> list[DocumentPassage]:
        query_tokens = _tokenize(query)
        scored: list[tuple[int, LogisticsDocument]] = []
        for doc in candidates:
            doc_tokens = _tokenize(f"{doc.title} {doc.content}")
            overlap = len(query_tokens & doc_tokens)
            if overlap > 0:
                scored.append((overlap, doc))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [self._to_passage(doc, doc.content[:800], None) for _score, doc in scored[:limit]]

    def _to_passage(self, doc: LogisticsDocument, chunk_text: str, relevance: float | None) -> DocumentPassage:
        return DocumentPassage(
            document_id=doc.document_id,
            title=doc.title,
            document_type=doc.document_type,
            jurisdiction=doc.jurisdiction,
            source_reference=doc.source_reference,
            document_version=doc.document_version,
            effective_from=doc.effective_from,
            effective_to=doc.effective_to,
            is_demo_content=doc.is_demo_content,
            chunk_text=chunk_text,
            relevance_score=relevance,
        )
