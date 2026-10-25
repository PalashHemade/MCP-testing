import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import DriverStatus


class Driver(Base):
    __tablename__ = "drivers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "licence_number", name="uq_driver_tenant_licence"),
        UniqueConstraint("tenant_id", "driver_id", name="uq_drivers_tenant_driver"),
        Index("ix_drivers_tenant_id", "tenant_id"),
    )

    driver_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False
    )
    driver_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50))
    licence_number: Mapped[str] = mapped_column(String(80), nullable=False)
    driver_status: Mapped[DriverStatus] = mapped_column(
        Enum(DriverStatus, name="driver_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False, default=DriverStatus.ACTIVE
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
