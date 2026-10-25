import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DocumentType

EMBEDDING_DIM = 768  # must match settings.gemini_embedding_dimensions


class LogisticsDocument(Base):
    """A policy / port-regulation document.

    tenant_id is NULL for globally-applicable demo documents (e.g. generic
    port regulations); non-null for tenant-private documents. Retrieval
    must only ever return rows where tenant_id IS NULL OR tenant_id =
    <caller's tenant> - see app.services.document_service.
    """

    __tablename__ = "logistics_documents"
    __table_args__ = (
        ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], name="fk_documents_tenant"),
        Index("ix_documents_tenant_id", "tenant_id"),
        Index("ix_documents_type", "document_type"),
    )

    document_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    document_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, name="document_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False
    )
    jurisdiction: Mapped[str | None] = mapped_column(String(120))
    source_reference: Mapped[str | None] = mapped_column(String(500))
    document_version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0")
    effective_from: Mapped[date | None] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_demo_content: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class DocumentChunk(Base):
    """Chunked + embedded passages of a LogisticsDocument, used for RAG."""

    __tablename__ = "document_chunks"
    __table_args__ = (
        ForeignKeyConstraint(
            ["document_id"], ["logistics_documents.document_id"], ondelete="CASCADE",
            name="fk_chunks_document",
        ),
        Index("ix_chunks_document_id", "document_id"),
    )

    chunk_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
