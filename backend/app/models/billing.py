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
from app.models.enums import PaymentStatus


class TripBilling(Base):
    """One invoice row for a trip.

    The schema supports MULTIPLE invoices per trip (no uniqueness on
    trip_id alone) - the demo seed mostly creates one invoice per trip for
    simplicity, but financial calculations (see app.services.financials)
    aggregate across all invoice rows for a trip rather than assuming
    exactly one, so adding more invoices later will not corrupt totals.
    """

    __tablename__ = "trip_billing"
    __table_args__ = (
        UniqueConstraint("tenant_id", "invoice_number", name="uq_billing_tenant_invoice"),
        ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], name="fk_billing_tenant"),
        ForeignKeyConstraint(
            ["tenant_id", "trip_id"],
            ["trips.tenant_id", "trips.trip_id"],
            name="fk_billing_tenant_trip",
        ),
        CheckConstraint("freight_charge >= 0", name="ck_billing_freight_nonneg"),
        CheckConstraint("additional_charges >= 0", name="ck_billing_additional_nonneg"),
        CheckConstraint("tax_amount >= 0", name="ck_billing_tax_nonneg"),
        CheckConstraint("amount_paid >= 0", name="ck_billing_paid_nonneg"),
        Index("ix_billing_tenant_trip", "tenant_id", "trip_id"),
        Index("ix_billing_tenant_status", "tenant_id", "payment_status"),
        Index("ix_billing_tenant_due_date", "tenant_id", "due_date"),
    )

    billing_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    trip_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(50), nullable=False)
    freight_charge: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    additional_charges: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    invoice_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status", values_callable=lambda e: [m.value for m in e]),
        nullable=False, default=PaymentStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
