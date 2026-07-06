"""Invoice routes: upload, list, detail, status poll, human override."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session, selectinload

from agents.graph import run_pipeline
from config import get_settings
from database import get_db
from models import AuditLog, Invoice
from services import memory_service
from schemas import (
    InvoiceDetail,
    InvoiceStatusOut,
    InvoiceSummary,
    OverrideRequest,
    UploadResponse,
)

router = APIRouter(tags=["invoices"])

ACTIVE_STATUSES = ("pending", "processing", "approved", "escalated", "rejected")


def _validator_flags(invoice: Invoice) -> list[str]:
    """Recover the validation flags from the ValidatorAgent audit entry, if present."""
    entry = next(
        (a for a in (invoice.audit_entries or []) if a.agent_name == "ValidatorAgent"),
        None,
    )
    if not entry or not entry.detail or "no issues" in entry.detail.lower():
        return []
    return [f.strip() for f in entry.detail.split(";") if f.strip()]


@router.post("/upload-invoice", response_model=UploadResponse)
async def upload_invoice(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Accept a PDF upload, create a pending invoice, and kick off the pipeline."""
    if file.content_type not in ("application/pdf", "application/octet-stream") and not (
        file.filename or ""
    ).lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Persist the raw PDF to disk for auditing / reprocessing.
    settings = get_settings()
    upload_dir = settings.UPLOAD_DIR
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = os.path.basename(file.filename or "upload.pdf")
    stored_name = f"{uuid.uuid4().hex}_{safe_name}"
    stored_path = os.path.join(upload_dir, stored_name)
    try:
        with open(stored_path, "wb") as fh:
            fh.write(pdf_bytes)
    except OSError:
        stored_path = None

    invoice = Invoice(filename=safe_name, status="pending")
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    db.add(
        AuditLog(
            invoice_id=invoice.id,
            agent_name="Supervisor",
            action="Invoice uploaded",
            detail=(
                f"File '{invoice.filename}' received; pipeline queued."
                + (f" Saved to '{stored_path}'." if stored_path else "")
            ),
            severity="info",
        )
    )
    db.commit()

    background_tasks.add_task(run_pipeline, invoice.id, pdf_bytes, invoice.filename)

    return UploadResponse(id=invoice.id, status=invoice.status, filename=invoice.filename)


@router.get("/invoices", response_model=list[InvoiceSummary])
def list_invoices(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """List all invoices, optionally filtered by status."""
    query = db.query(Invoice)
    if status:
        if status not in ACTIVE_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status filter.")
        query = query.filter(Invoice.status == status)
    return query.order_by(Invoice.uploaded_at.desc()).all()


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetail)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    """Return full invoice detail including line items and audit log."""
    invoice = (
        db.query(Invoice)
        .options(
            selectinload(Invoice.line_items),
            selectinload(Invoice.audit_entries),
        )
        .filter(Invoice.id == invoice_id)
        .one_or_none()
    )
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    # Order audit entries chronologically.
    invoice.audit_entries.sort(key=lambda a: (a.created_at or datetime.min.replace(tzinfo=timezone.utc), a.id))
    return invoice


@router.get("/invoices/{invoice_id}/status", response_model=InvoiceStatusOut)
def get_invoice_status(invoice_id: int, db: Session = Depends(get_db)):
    """Lightweight polling endpoint returning the current status."""
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    return InvoiceStatusOut(
        id=invoice.id, status=invoice.status, anomaly_score=invoice.anomaly_score
    )


@router.post("/invoices/{invoice_id}/override", response_model=InvoiceDetail)
def override_invoice(
    invoice_id: int,
    body: OverrideRequest,
    db: Session = Depends(get_db),
):
    """Human override of the pipeline decision."""
    invoice = (
        db.query(Invoice)
        .options(
            selectinload(Invoice.line_items),
            selectinload(Invoice.audit_entries),
        )
        .filter(Invoice.id == invoice_id)
        .one_or_none()
    )
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    new_status = "approved" if body.decision == "approve" else "rejected"
    invoice.status = new_status
    invoice.processed_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            invoice_id=invoice.id,
            agent_name="Human",
            action=f"Manual override: {body.decision}",
            detail=f"Status manually set to '{new_status}' by a human reviewer.",
            severity="warning",
        )
    )
    db.commit()
    memory_service.record_decision(
        db, invoice, new_status, _validator_flags(invoice), source="human"
    )
    db.refresh(invoice)
    invoice.audit_entries.sort(key=lambda a: (a.created_at or datetime.min.replace(tzinfo=timezone.utc), a.id))
    return invoice


@router.post("/invoices/{invoice_id}/approve", response_model=InvoiceDetail)
def approve_invoice(invoice_id: int, db: Session = Depends(get_db)):
    """Human override to approve an escalated (or any pending) invoice."""
    invoice = (
        db.query(Invoice)
        .options(
            selectinload(Invoice.line_items),
            selectinload(Invoice.audit_entries),
        )
        .filter(Invoice.id == invoice_id)
        .one_or_none()
    )
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    invoice.status = "approved"
    invoice.processed_at = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            invoice_id=invoice.id,
            agent_name="Human",
            action="Manual approval",
            detail="Escalated invoice manually approved by a human reviewer.",
            severity="warning",
        )
    )
    db.commit()
    memory_service.record_decision(
        db, invoice, "approved", _validator_flags(invoice), source="human"
    )
    db.refresh(invoice)
    invoice.audit_entries.sort(key=lambda a: (a.created_at or datetime.min.replace(tzinfo=timezone.utc), a.id))
    return invoice
