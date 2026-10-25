import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.document import EMBEDDING_DIM


class ToolMetadata(Base):
    """Registry row describing one MCP tool, used for embedding-based
    discovery and plan validation. Kept in sync with
    app.mcp.registry.TOOL_DEFINITIONS - see
    app.scripts.rebuild_tool_embeddings for how embeddings are (re)built.
    """

    __tablename__ = "tool_metadata"

    tool_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(String(2000), nullable=False)
    purpose: Mapped[str] = mapped_column(String(500), nullable=False)
    input_schema: Mapped[dict] = mapped_column(JSON, nullable=False)
    output_schema: Mapped[dict] = mapped_column(JSON, nullable=False)
    prerequisites: Mapped[str | None] = mapped_column(String(1000))
    dependencies: Mapped[str | None] = mapped_column(String(1000))
    limitations: Mapped[str | None] = mapped_column(String(1000))
    permissions: Mapped[str | None] = mapped_column(String(500))
    result_semantics: Mapped[str | None] = mapped_column(String(1000))
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
