from datetime import date
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import DocumentChunk, LogisticsDocument
from app.models.enums import DocumentType


class DocumentRepository:
    """Tenant isolation rule: a row is visible if tenant_id IS NULL (global
    demo content) OR tenant_id matches the caller's tenant. Never returns
    another tenant's private documents.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def search_candidates(
        self,
        *,
        tenant_id: UUID,
        document_type: DocumentType | None = None,
        jurisdiction: str | None = None,
        effective_date: date | None = None,
    ) -> list[LogisticsDocument]:
        query = select(LogisticsDocument).where(
            or_(LogisticsDocument.tenant_id.is_(None), LogisticsDocument.tenant_id == tenant_id)
        )
        if document_type:
            query = query.where(LogisticsDocument.document_type == document_type)
        if jurisdiction:
            query = query.where(LogisticsDocument.jurisdiction.ilike(f"%{jurisdiction}%"))
        if effective_date:
            query = query.where(
                or_(LogisticsDocument.effective_from.is_(None), LogisticsDocument.effective_from <= effective_date),
                or_(LogisticsDocument.effective_to.is_(None), LogisticsDocument.effective_to >= effective_date),
            )
        return list((await self.session.execute(query)).scalars().all())

    async def get_chunks_for_documents(self, *, document_ids: list[UUID]) -> list[DocumentChunk]:
        if not document_ids:
            return []
        query = select(DocumentChunk).where(DocumentChunk.document_id.in_(document_ids))
        return list((await self.session.execute(query)).scalars().all())

    async def get_all_chunks_with_documents(
        self, *, tenant_id: UUID
    ) -> list[tuple[DocumentChunk, LogisticsDocument]]:
        query = (
            select(DocumentChunk, LogisticsDocument)
            .join(LogisticsDocument, LogisticsDocument.document_id == DocumentChunk.document_id)
            .where(or_(LogisticsDocument.tenant_id.is_(None), LogisticsDocument.tenant_id == tenant_id))
        )
        return list((await self.session.execute(query)).all())
