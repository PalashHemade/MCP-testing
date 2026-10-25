import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import VehicleStatus


class Vehicle(Base):
    __tablename__ = "vehicles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "registration_no", name="uq_vehicle_tenant_registration"),
        UniqueConstraint("tenant_id", "vehicle_id", name="uq_vehicles_tenant_vehicle"),
        Index("ix_vehicles_tenant_id", "tenant_id"),
    )

    vehicle_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False
    )
    registration_no: Mapped[str] = mapped_column(String(50), nullable=False)
    vehicle_type: Mapped[str] = mapped_column(String(80), nullable=False)
    capacity_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    vehicle_status: Mapped[VehicleStatus] = mapped_column(
        Enum(VehicleStatus, name="vehicle_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False, default=VehicleStatus.ACTIVE
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
