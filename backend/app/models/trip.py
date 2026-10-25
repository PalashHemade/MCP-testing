import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import TripStatus


class Trip(Base):
    __tablename__ = "trips"
    __table_args__ = (
        UniqueConstraint("tenant_id", "trip_number", name="uq_trips_tenant_trip_number"),
        UniqueConstraint("tenant_id", "lr_number", name="uq_trips_tenant_lr_number"),
        UniqueConstraint("tenant_id", "trip_id", name="uq_trips_tenant_trip"),
        ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], name="fk_trips_tenant"),
        # Composite FKs below are what actually enforce "a trip cannot
        # reference another tenant's customer/vehicle/driver" at the DB
        # level, rather than relying on application code alone.
        ForeignKeyConstraint(
            ["tenant_id", "customer_id"],
            ["customers.tenant_id", "customers.customer_id"],
            name="fk_trips_tenant_customer",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "vehicle_id"],
            ["vehicles.tenant_id", "vehicles.vehicle_id"],
            name="fk_trips_tenant_vehicle",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "driver_id"],
            ["drivers.tenant_id", "drivers.driver_id"],
            name="fk_trips_tenant_driver",
        ),
        CheckConstraint("distance_km IS NULL OR distance_km >= 0", name="ck_trips_distance_nonneg"),
        Index("ix_trips_tenant_id", "tenant_id"),
        Index("ix_trips_tenant_status", "tenant_id", "trip_status"),
        Index("ix_trips_tenant_customer", "tenant_id", "customer_id"),
        Index("ix_trips_tenant_vehicle", "tenant_id", "vehicle_id"),
        Index("ix_trips_tenant_driver", "tenant_id", "driver_id"),
        Index("ix_trips_tenant_dates", "tenant_id", "start_date"),
    )

    trip_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    trip_number: Mapped[str] = mapped_column(String(50), nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    driver_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    lr_number: Mapped[str] = mapped_column(String(50), nullable=False)
    origin: Mapped[str] = mapped_column(String(120), nullable=False)
    destination: Mapped[str] = mapped_column(String(120), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_delivery_date: Mapped[date | None] = mapped_column(Date)
    actual_delivery_date: Mapped[date | None] = mapped_column(Date)
    distance_km: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    trip_status: Mapped[TripStatus] = mapped_column(
        Enum(TripStatus, name="trip_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False, default=TripStatus.PLANNED
    )
    cargo_description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
