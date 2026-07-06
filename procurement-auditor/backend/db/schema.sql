-- Procurement Auditor — full schema for a fresh Supabase / PostgreSQL database.
-- Run this in the Supabase SQL editor (or psql) before first deploy.
-- All statements are idempotent (IF NOT EXISTS) so re-running is safe.

-- pgvector powers the agent decision-memory (RAG) feature.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS purchase_orders (
    id              SERIAL PRIMARY KEY,
    po_number       TEXT NOT NULL UNIQUE,
    vendor_name     TEXT NOT NULL,
    item_description TEXT NOT NULL,
    unit_price      NUMERIC(10, 2) NOT NULL,
    quantity        INTEGER NOT NULL,
    total_amount    NUMERIC(10, 2) NOT NULL,
    order_date      DATE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
    id                 SERIAL PRIMARY KEY,
    filename           TEXT NOT NULL,
    vendor_name        TEXT,
    invoice_number     TEXT,
    po_number          TEXT REFERENCES purchase_orders (po_number),
    invoice_date       DATE,
    total_amount       NUMERIC(10, 2),
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'processing', 'approved', 'escalated', 'rejected')),
    anomaly_score      NUMERIC(5, 4),
    is_anomaly         BOOLEAN NOT NULL DEFAULT FALSE,
    raw_extracted_json JSONB,
    uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id           SERIAL PRIMARY KEY,
    invoice_id   INTEGER NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    description  TEXT,
    quantity     INTEGER,
    unit_price   NUMERIC(10, 2),
    line_total   NUMERIC(10, 2)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          SERIAL PRIMARY KEY,
    invoice_id  INTEGER NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    agent_name  TEXT NOT NULL,
    action      TEXT NOT NULL,
    detail      TEXT,
    severity    TEXT NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info', 'warning', 'critical')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive migration for installs created before is_anomaly existed.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_anomaly BOOLEAN NOT NULL DEFAULT FALSE;

-- Agent decision memory (vector store for RAG-augmented routing).
CREATE TABLE IF NOT EXISTS decision_memory (
    id           SERIAL PRIMARY KEY,
    invoice_id   INTEGER REFERENCES invoices (id) ON DELETE SET NULL,
    vendor_name  TEXT,
    summary      TEXT NOT NULL,
    embedding    VECTOR(384),
    status       TEXT,
    is_override  BOOLEAN NOT NULL DEFAULT FALSE,
    anomaly_score NUMERIC(5, 4),
    total_amount NUMERIC(10, 2),
    flags        JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_uploaded_at ON invoices (uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_audit_invoice ON audit_log (invoice_id);
CREATE INDEX IF NOT EXISTS idx_decision_memory_vendor ON decision_memory (lower(vendor_name));
CREATE INDEX IF NOT EXISTS idx_decision_memory_embedding
    ON decision_memory USING hnsw (embedding vector_cosine_ops);
