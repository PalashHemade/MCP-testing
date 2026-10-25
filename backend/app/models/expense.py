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
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ExpenseCategory


class TripExpense(Base):
    __tablename__ = "trip_expenses"
    __table_args__ = (
        ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], name="fk_expenses_tenant"),
        ForeignKeyConstraint(
            ["tenant_id", "trip_id"],
            ["trips.tenant_id", "trips.trip_id"],
            name="fk_expenses_tenant_trip",
        ),
        CheckConstraint("amount >= 0", name="ck_expenses_amount_nonneg"),
        Index("ix_expenses_tenant_trip", "tenant_id", "trip_id"),
        Index("ix_expenses_tenant_category", "tenant_id", "expense_category"),
    )

    expense_id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    trip_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    expense_category: Mapped[ExpenseCategory] = mapped_column(
        Enum(ExpenseCategory, name="expense_category", values_callable=lambda e: [m.value for m in e]),
        nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
