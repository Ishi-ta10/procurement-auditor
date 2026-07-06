"""Pydantic request/response schemas."""
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict


class LineItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: Optional[str] = None
    quantity: Optional[int] = None
    unit_price: Optional[Decimal] = None
    line_total: Optional[Decimal] = None


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int
    agent_name: str
    action: str
    detail: Optional[str] = None
    severity: str
    created_at: datetime


class InvoiceSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None
    po_number: Optional[str] = None
    invoice_date: Optional[date] = None
    total_amount: Optional[Decimal] = None
    status: str
    anomaly_score: Optional[Decimal] = None
    is_anomaly: bool = False
    uploaded_at: datetime
    processed_at: Optional[datetime] = None


class InvoiceDetail(InvoiceSummary):
    raw_extracted_json: Optional[dict[str, Any]] = None
    line_items: list[LineItemOut] = []
    audit_entries: list[AuditLogOut] = []


class InvoiceStatusOut(BaseModel):
    id: int
    status: str
    anomaly_score: Optional[Decimal] = None
    is_anomaly: bool = False


class UploadResponse(BaseModel):
    id: int
    status: str
    filename: str


class OverrideRequest(BaseModel):
    decision: Literal["approve", "reject"]


class PurchaseOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    po_number: str
    vendor_name: str
    item_description: str
    unit_price: Decimal
    quantity: int
    total_amount: Decimal
    order_date: date
    created_at: datetime


class AnomalyBucket(BaseModel):
    label: str
    count: int


class DashboardSummary(BaseModel):
    total_invoices: int
    auto_approved_pct: float
    flagged_today: int
    status_breakdown: dict[str, int]
    anomaly_score_distribution: list[AnomalyBucket]
