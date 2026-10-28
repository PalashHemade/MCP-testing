import type { MigrationBuilder } from "node-pg-migrate";

/** Initial schema - a direct port of the Python backend's
 * alembic/versions/0001_initial_schema.py, same table/column/constraint
 * names, so the two backends' demo data stays structurally comparable.
 * pgvector is intentionally NOT included - this backend uses OKF
 * knowledge files instead of embeddings (see ../knowledge, docs/okf.md).
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TYPE trip_status AS ENUM ('planned', 'in_transit', 'completed', 'cancelled');
    CREATE TYPE vehicle_status AS ENUM ('active', 'maintenance', 'inactive');
    CREATE TYPE driver_status AS ENUM ('active', 'inactive');
    CREATE TYPE payment_status AS ENUM ('unpaid', 'partially_paid', 'paid', 'draft', 'cancelled');
    CREATE TYPE expense_category AS ENUM ('fuel', 'toll', 'loading', 'allowance', 'maintenance', 'other');
    CREATE TYPE document_type AS ENUM ('policy', 'port_regulation', 'procedure', 'other');

    CREATE TABLE tenants (
      tenant_id UUID PRIMARY KEY,
      tenant_name VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE customers (
      customer_id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
      customer_name VARCHAR(255) NOT NULL,
      contact_email VARCHAR(255),
      phone VARCHAR(50),
      address VARCHAR(500),
      city VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_customers_tenant_customer UNIQUE (tenant_id, customer_id)
    );
    CREATE INDEX ix_customers_tenant_id ON customers (tenant_id);

    CREATE TABLE vehicles (
      vehicle_id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
      registration_no VARCHAR(50) NOT NULL,
      vehicle_type VARCHAR(80) NOT NULL,
      capacity_tonnes NUMERIC(8, 2),
      vehicle_status vehicle_status NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_vehicle_tenant_registration UNIQUE (tenant_id, registration_no),
      CONSTRAINT uq_vehicles_tenant_vehicle UNIQUE (tenant_id, vehicle_id)
    );
    CREATE INDEX ix_vehicles_tenant_id ON vehicles (tenant_id);

    CREATE TABLE drivers (
      driver_id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
      driver_name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      licence_number VARCHAR(80) NOT NULL,
      driver_status driver_status NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_driver_tenant_licence UNIQUE (tenant_id, licence_number),
      CONSTRAINT uq_drivers_tenant_driver UNIQUE (tenant_id, driver_id)
    );
    CREATE INDEX ix_drivers_tenant_id ON drivers (tenant_id);

    CREATE TABLE trips (
      trip_id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
      trip_number VARCHAR(50) NOT NULL,
      customer_id UUID NOT NULL,
      vehicle_id UUID NOT NULL,
      driver_id UUID NOT NULL,
      lr_number VARCHAR(50) NOT NULL,
      origin VARCHAR(120) NOT NULL,
      destination VARCHAR(120) NOT NULL,
      start_date DATE NOT NULL,
      planned_delivery_date DATE,
      actual_delivery_date DATE,
      distance_km NUMERIC(10, 2) CHECK (distance_km IS NULL OR distance_km >= 0),
      trip_status trip_status NOT NULL DEFAULT 'planned',
      cargo_description VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_trips_tenant_trip_number UNIQUE (tenant_id, trip_number),
      CONSTRAINT uq_trips_tenant_lr_number UNIQUE (tenant_id, lr_number),
      CONSTRAINT uq_trips_tenant_trip UNIQUE (tenant_id, trip_id),
      CONSTRAINT fk_trips_tenant_customer FOREIGN KEY (tenant_id, customer_id)
        REFERENCES customers (tenant_id, customer_id),
      CONSTRAINT fk_trips_tenant_vehicle FOREIGN KEY (tenant_id, vehicle_id)
        REFERENCES vehicles (tenant_id, vehicle_id),
      CONSTRAINT fk_trips_tenant_driver FOREIGN KEY (tenant_id, driver_id)
        REFERENCES drivers (tenant_id, driver_id)
    );
    CREATE INDEX ix_trips_tenant_id ON trips (tenant_id);
    CREATE INDEX ix_trips_tenant_status ON trips (tenant_id, trip_status);
    CREATE INDEX ix_trips_tenant_customer ON trips (tenant_id, customer_id);
    CREATE INDEX ix_trips_tenant_vehicle ON trips (tenant_id, vehicle_id);
    CREATE INDEX ix_trips_tenant_driver ON trips (tenant_id, driver_id);
    CREATE INDEX ix_trips_tenant_dates ON trips (tenant_id, start_date);

    CREATE TABLE trip_billing (
      billing_id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL,
      trip_id UUID NOT NULL,
      invoice_number VARCHAR(50) NOT NULL,
      freight_charge NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (freight_charge >= 0),
      additional_charges NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (additional_charges >= 0),
      tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
      amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
      invoice_date DATE,
      due_date DATE,
      payment_status payment_status NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT uq_billing_tenant_invoice UNIQUE (tenant_id, invoice_number),
      CONSTRAINT fk_billing_tenant_trip FOREIGN KEY (tenant_id, trip_id)
        REFERENCES trips (tenant_id, trip_id)
    );
    CREATE INDEX ix_billing_tenant_trip ON trip_billing (tenant_id, trip_id);
    CREATE INDEX ix_billing_tenant_status ON trip_billing (tenant_id, payment_status);
    CREATE INDEX ix_billing_tenant_due_date ON trip_billing (tenant_id, due_date);

    CREATE TABLE trip_expenses (
      expense_id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL,
      trip_id UUID NOT NULL,
      expense_category expense_category NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
      expense_date DATE NOT NULL,
      description VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT fk_expenses_tenant_trip FOREIGN KEY (tenant_id, trip_id)
        REFERENCES trips (tenant_id, trip_id)
    );
    CREATE INDEX ix_expenses_tenant_trip ON trip_expenses (tenant_id, trip_id);
    CREATE INDEX ix_expenses_tenant_category ON trip_expenses (tenant_id, expense_category);

    CREATE TABLE logistics_documents (
      document_id UUID PRIMARY KEY,
      tenant_id UUID REFERENCES tenants(tenant_id),
      title VARCHAR(255) NOT NULL,
      document_type document_type NOT NULL,
      jurisdiction VARCHAR(120),
      source_reference VARCHAR(500),
      document_version VARCHAR(50) NOT NULL DEFAULT '1.0',
      effective_from DATE,
      effective_to DATE,
      content TEXT NOT NULL,
      is_demo_content BOOLEAN NOT NULL DEFAULT true,
      okf_concept_path VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX ix_documents_tenant_id ON logistics_documents (tenant_id);
    CREATE INDEX ix_documents_type ON logistics_documents (document_type);

    -- No document_chunks / embedding table in this backend - full-text
    -- search (tsvector) over logistics_documents.content is used instead
    -- (see Tool 10 in docs/tools.md); OKF files describe document
    -- metadata/structure, not full document content for search.
    ALTER TABLE logistics_documents ADD COLUMN content_tsv tsvector
      GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
    CREATE INDEX ix_documents_content_tsv ON logistics_documents USING GIN (content_tsv);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS logistics_documents CASCADE;
    DROP TABLE IF EXISTS trip_expenses CASCADE;
    DROP TABLE IF EXISTS trip_billing CASCADE;
    DROP TABLE IF EXISTS trips CASCADE;
    DROP TABLE IF EXISTS drivers CASCADE;
    DROP TABLE IF EXISTS vehicles CASCADE;
    DROP TABLE IF EXISTS customers CASCADE;
    DROP TABLE IF EXISTS tenants CASCADE;
    DROP TYPE IF EXISTS document_type;
    DROP TYPE IF EXISTS expense_category;
    DROP TYPE IF EXISTS payment_status;
    DROP TYPE IF EXISTS driver_status;
    DROP TYPE IF EXISTS vehicle_status;
    DROP TYPE IF EXISTS trip_status;
  `);
}
