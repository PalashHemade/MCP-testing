"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIM = 768

trip_status = sa.Enum("planned", "in_transit", "completed", "cancelled", name="trip_status")
vehicle_status = sa.Enum("active", "maintenance", "inactive", name="vehicle_status")
driver_status = sa.Enum("active", "inactive", name="driver_status")
payment_status = sa.Enum(
    "unpaid", "partially_paid", "paid", "draft", "cancelled", name="payment_status"
)
expense_category = sa.Enum(
    "fuel", "toll", "loading", "allowance", "maintenance", "other", name="expense_category"
)
document_type = sa.Enum("policy", "port_regulation", "procedure", "other", name="document_type")


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Enum types are created automatically (checkfirst) the first time each
    # is used as a column type below - no separate CREATE TYPE step needed.

    op.create_table(
        "tenants",
        sa.Column("tenant_id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_name", sa.String(255), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "customers",
        sa.Column("customer_id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False),
        sa.Column("customer_name", sa.String(255), nullable=False),
        sa.Column("contact_email", sa.String(255)),
        sa.Column("phone", sa.String(50)),
        sa.Column("address", sa.String(500)),
        sa.Column("city", sa.String(120)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "customer_id", name="uq_customers_tenant_customer"),
    )
    op.create_index("ix_customers_tenant_id", "customers", ["tenant_id"])

    op.create_table(
        "vehicles",
        sa.Column("vehicle_id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False),
        sa.Column("registration_no", sa.String(50), nullable=False),
        sa.Column("vehicle_type", sa.String(80), nullable=False),
        sa.Column("capacity_tonnes", sa.Numeric(8, 2)),
        sa.Column("vehicle_status", vehicle_status, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "registration_no", name="uq_vehicle_tenant_registration"),
        sa.UniqueConstraint("tenant_id", "vehicle_id", name="uq_vehicles_tenant_vehicle"),
    )
    op.create_index("ix_vehicles_tenant_id", "vehicles", ["tenant_id"])

    op.create_table(
        "drivers",
        sa.Column("driver_id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False),
        sa.Column("driver_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50)),
        sa.Column("licence_number", sa.String(80), nullable=False),
        sa.Column("driver_status", driver_status, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "licence_number", name="uq_driver_tenant_licence"),
        sa.UniqueConstraint("tenant_id", "driver_id", name="uq_drivers_tenant_driver"),
    )
    op.create_index("ix_drivers_tenant_id", "drivers", ["tenant_id"])

    op.create_table(
        "trips",
        sa.Column("trip_id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("trip_number", sa.String(50), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=False),
        sa.Column("lr_number", sa.String(50), nullable=False),
        sa.Column("origin", sa.String(120), nullable=False),
        sa.Column("destination", sa.String(120), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("planned_delivery_date", sa.Date()),
        sa.Column("actual_delivery_date", sa.Date()),
        sa.Column("distance_km", sa.Numeric(10, 2)),
        sa.Column("trip_status", trip_status, nullable=False, server_default="planned"),
        sa.Column("cargo_description", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "trip_number", name="uq_trips_tenant_trip_number"),
        sa.UniqueConstraint("tenant_id", "lr_number", name="uq_trips_tenant_lr_number"),
        sa.UniqueConstraint("tenant_id", "trip_id", name="uq_trips_tenant_trip"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], name="fk_trips_tenant"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "customer_id"], ["customers.tenant_id", "customers.customer_id"],
            name="fk_trips_tenant_customer",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "vehicle_id"], ["vehicles.tenant_id", "vehicles.vehicle_id"],
            name="fk_trips_tenant_vehicle",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id", "driver_id"], ["drivers.tenant_id", "drivers.driver_id"],
            name="fk_trips_tenant_driver",
        ),
        sa.CheckConstraint("distance_km IS NULL OR distance_km >= 0", name="ck_trips_distance_nonneg"),
    )
    op.create_index("ix_trips_tenant_id", "trips", ["tenant_id"])
    op.create_index("ix_trips_tenant_status", "trips", ["tenant_id", "trip_status"])
    op.create_index("ix_trips_tenant_customer", "trips", ["tenant_id", "customer_id"])
    op.create_index("ix_trips_tenant_vehicle", "trips", ["tenant_id", "vehicle_id"])
    op.create_index("ix_trips_tenant_driver", "trips", ["tenant_id", "driver_id"])
    op.create_index("ix_trips_tenant_dates", "trips", ["tenant_id", "start_date"])

    op.create_table(
        "trip_billing",
        sa.Column("billing_id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("trip_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_number", sa.String(50), nullable=False),
        sa.Column("freight_charge", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("additional_charges", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("amount_paid", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("invoice_date", sa.Date()),
        sa.Column("due_date", sa.Date()),
        sa.Column("payment_status", payment_status, nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "invoice_number", name="uq_billing_tenant_invoice"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], name="fk_billing_tenant"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "trip_id"], ["trips.tenant_id", "trips.trip_id"], name="fk_billing_tenant_trip",
        ),
        sa.CheckConstraint("freight_charge >= 0", name="ck_billing_freight_nonneg"),
        sa.CheckConstraint("additional_charges >= 0", name="ck_billing_additional_nonneg"),
        sa.CheckConstraint("tax_amount >= 0", name="ck_billing_tax_nonneg"),
        sa.CheckConstraint("amount_paid >= 0", name="ck_billing_paid_nonneg"),
    )
    op.create_index("ix_billing_tenant_trip", "trip_billing", ["tenant_id", "trip_id"])
    op.create_index("ix_billing_tenant_status", "trip_billing", ["tenant_id", "payment_status"])
    op.create_index("ix_billing_tenant_due_date", "trip_billing", ["tenant_id", "due_date"])

    op.create_table(
        "trip_expenses",
        sa.Column("expense_id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("trip_id", sa.Uuid(), nullable=False),
        sa.Column("expense_category", expense_category, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], name="fk_expenses_tenant"),
        sa.ForeignKeyConstraint(
            ["tenant_id", "trip_id"], ["trips.tenant_id", "trips.trip_id"], name="fk_expenses_tenant_trip",
        ),
        sa.CheckConstraint("amount >= 0", name="ck_expenses_amount_nonneg"),
    )
    op.create_index("ix_expenses_tenant_trip", "trip_expenses", ["tenant_id", "trip_id"])
    op.create_index("ix_expenses_tenant_category", "trip_expenses", ["tenant_id", "expense_category"])

    op.create_table(
        "logistics_documents",
        sa.Column("document_id", sa.Uuid(), primary_key=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("document_type", document_type, nullable=False),
        sa.Column("jurisdiction", sa.String(120)),
        sa.Column("source_reference", sa.String(500)),
        sa.Column("document_version", sa.String(50), nullable=False, server_default="1.0"),
        sa.Column("effective_from", sa.Date()),
        sa.Column("effective_to", sa.Date()),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_demo_content", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.tenant_id"], name="fk_documents_tenant"),
    )
    op.create_index("ix_documents_tenant_id", "logistics_documents", ["tenant_id"])
    op.create_index("ix_documents_type", "logistics_documents", ["document_type"])

    op.create_table(
        "document_chunks",
        sa.Column("chunk_id", sa.Uuid(), primary_key=True),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["document_id"], ["logistics_documents.document_id"], ondelete="CASCADE", name="fk_chunks_document",
        ),
    )
    op.create_index("ix_chunks_document_id", "document_chunks", ["document_id"])

    op.create_table(
        "tool_metadata",
        sa.Column("tool_id", sa.Uuid(), primary_key=True),
        sa.Column("tool_name", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.String(2000), nullable=False),
        sa.Column("purpose", sa.String(500), nullable=False),
        sa.Column("input_schema", sa.JSON(), nullable=False),
        sa.Column("output_schema", sa.JSON(), nullable=False),
        sa.Column("prerequisites", sa.String(1000)),
        sa.Column("dependencies", sa.String(1000)),
        sa.Column("limitations", sa.String(1000)),
        sa.Column("permissions", sa.String(500)),
        sa.Column("result_semantics", sa.String(1000)),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("tool_metadata")
    op.drop_table("document_chunks")
    op.drop_table("logistics_documents")
    op.drop_table("trip_expenses")
    op.drop_table("trip_billing")
    op.drop_table("trips")
    op.drop_table("drivers")
    op.drop_table("vehicles")
    op.drop_table("customers")
    op.drop_table("tenants")

    for enum in (document_type, expense_category, payment_status, driver_status, vehicle_status, trip_status):
        enum.drop(op.get_bind(), checkfirst=True)
