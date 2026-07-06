"""Idempotent database bootstrap.

Safe to run repeatedly on a fresh or existing database (local or Supabase):
  - creates any missing tables from the SQLAlchemy models
  - adds the ``invoices.is_anomaly`` column if an older schema lacks it

Run with:  python bootstrap.py
"""
from __future__ import annotations

from sqlalchemy import inspect, text

from database import Base, engine
import models  # noqa: F401 - register models on Base.metadata


def bootstrap() -> None:
    # Enable pgvector BEFORE create_all so the vector column type is available.
    vector_ok = False
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        vector_ok = True
        print("pgvector extension enabled.")
    except Exception as exc:  # noqa: BLE001
        print(f"WARNING: could not enable pgvector extension ({exc}). "
              "Memory features will be disabled until it is enabled.")

    # Create any tables that don't exist yet.
    Base.metadata.create_all(bind=engine)

    # Additive migration for the is_anomaly column on pre-existing installs.
    insp = inspect(engine)
    if "invoices" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("invoices")}
        if "is_anomaly" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE invoices "
                        "ADD COLUMN IF NOT EXISTS is_anomaly boolean NOT NULL DEFAULT false"
                    )
                )
            print("Added invoices.is_anomaly column.")

    # Best-effort ANN index for fast similarity search on decision memory.
    if vector_ok and "decision_memory" in inspect(engine).get_table_names():
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS idx_decision_memory_embedding "
                        "ON decision_memory USING hnsw (embedding vector_cosine_ops)"
                    )
                )
            print("Ensured decision_memory HNSW index.")
        except Exception as exc:  # noqa: BLE001
            print(f"Note: skipped HNSW index ({exc}).")

    print("Bootstrap complete.")


if __name__ == "__main__":
    bootstrap()
