"""SQLAlchemy ORM models mapping the existing Supabase schema exactly."""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

try:  # pgvector is optional at import time; memory features degrade if missing.
    from pgvector.sqlalchemy import Vector

    _EMBED_DIM = 384
    _EmbeddingType = Vector(_EMBED_DIM)
except Exception:  # noqa: BLE001
    from sqlalchemy import Text as _Text

    _EmbeddingType = _Text  # fallback: never used for real search


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    po_number: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    vendor_name: Mapped[str] = mapped_column(Text, nullable=False)
    item_description: Mapped[str] = mapped_column(Text, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    vendor_name: Mapped[str | None] = mapped_column(Text)
    invoice_number: Mapped[str | None] = mapped_column(Text)
    po_number: Mapped[str | None] = mapped_column(
        Text, ForeignKey("purchase_orders.po_number")
    )
    invoice_date: Mapped[date | None] = mapped_column(Date)
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    anomaly_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    is_anomaly: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    raw_extracted_json: Mapped[dict | None] = mapped_column(JSONB)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'processing', 'approved', 'escalated', 'rejected')",
            name="invoices_status_check",
        ),
    )

    line_items: Mapped[list["InvoiceLineItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )
    audit_entries: Mapped[list["AuditLog"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text)
    quantity: Mapped[int | None] = mapped_column(Integer)
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    line_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    agent_name: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(Text, default="info")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "severity IN ('info', 'warning', 'critical')",
            name="audit_log_severity_check",
        ),
    )

    invoice: Mapped["Invoice"] = relationship(back_populates="audit_entries")


class DecisionMemory(Base):
    """Vector memory of past invoice decisions for RAG-augmented routing.

    Each row is a natural-language summary of a decision (automated or human
    override) plus its embedding, so the Router can retrieve semantically similar
    past cases and reason over a vendor's history.
    """

    __tablename__ = "decision_memory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("invoices.id", ondelete="SET NULL")
    )
    vendor_name: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(_EmbeddingType)
    status: Mapped[str | None] = mapped_column(Text)
    is_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    anomaly_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    flags: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
