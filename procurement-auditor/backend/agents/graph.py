"""LangGraph pipeline wiring the 4 specialist agents in sequence.

Flow:
    extractor -> validator -> anomaly -> router -> (escalate email | finalize)

Each node writes an audit_log entry. The anomaly step branches to an email-escalation
node when the router decides the invoice must be escalated.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional, TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from agents import (
    anomaly_agent,
    extractor_agent,
    router_agent,
    validator_agent,
)
from database import SessionLocal
from models import AuditLog, Invoice, InvoiceLineItem
from services import email_service, memory_service

logger = logging.getLogger(__name__)


class InvoiceState(TypedDict, total=False):
    invoice_id: int
    pdf_bytes: bytes
    filename: str
    extracted: dict[str, Any]
    validation: dict[str, Any]
    vendor_mismatch: bool
    price_deviation: bool
    no_matching_po: bool
    anomaly_score: float
    is_anomaly: bool
    total_amount: float
    vendor_stats: dict[str, Any]
    similar_memories: list[dict[str, Any]]
    memory_context: str
    decision: dict[str, str]


# Backwards-compatible alias.
PipelineState = InvoiceState


def _log(db: Session, invoice_id: int, agent: str, action: str, detail: str, severity: str = "info") -> None:
    """Write a single audit_log row."""
    db.add(
        AuditLog(
            invoice_id=invoice_id,
            agent_name=agent,
            action=action,
            detail=detail[:2000] if detail else detail,
            severity=severity,
        )
    )
    db.commit()


def _to_decimal(value: Any) -> Optional[Decimal]:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _make_nodes(db: Session):
    """Build node callables bound to a database session."""

    def extractor_node(state: PipelineState) -> PipelineState:
        invoice = db.get(Invoice, state["invoice_id"])
        invoice.status = "processing"
        db.commit()

        extracted = extractor_agent.run(state["pdf_bytes"], state["filename"])

        # Persist extracted fields onto the invoice + line items.
        invoice.vendor_name = extracted.get("vendor") or None
        invoice.invoice_number = extracted.get("invoice_number") or None
        invoice.po_number = extracted.get("po_number") or None
        invoice.raw_extracted_json = extracted

        inv_date = extracted.get("invoice_date")
        if inv_date:
            try:
                invoice.invoice_date = datetime.strptime(inv_date, "%Y-%m-%d").date()
            except ValueError:
                invoice.invoice_date = None

        # Clear any prior line items, then insert extracted ones.
        db.query(InvoiceLineItem).filter(
            InvoiceLineItem.invoice_id == invoice.id
        ).delete()

        total = Decimal("0")
        for li in extracted.get("line_items") or []:
            qty = int(li.get("quantity") or 0)
            price = _to_decimal(li.get("unit_price")) or Decimal("0")
            line_total = price * qty
            total += line_total
            db.add(
                InvoiceLineItem(
                    invoice_id=invoice.id,
                    description=li.get("description"),
                    quantity=qty,
                    unit_price=price,
                    line_total=line_total,
                )
            )
        invoice.total_amount = total
        db.commit()

        item_count = len(extracted.get("line_items") or [])
        _log(
            db,
            invoice.id,
            "ExtractorAgent",
            "Extracted invoice data",
            f"Parsed {item_count} line item(s). Vendor='{extracted.get('vendor')}', "
            f"PO='{extracted.get('po_number')}'. {extracted.get('_extraction_note', '')}".strip(),
            severity="info" if item_count else "warning",
        )
        return {"extracted": extracted, "total_amount": float(total)}

    def validator_node(state: PipelineState) -> PipelineState:
        validation = validator_agent.run(state["extracted"], db)
        flags = validation.get("flags") or []
        _log(
            db,
            state["invoice_id"],
            "ValidatorAgent",
            "Validated against purchase order",
            "No issues found." if not flags else "; ".join(flags),
            severity="warning" if flags else "info",
        )
        return {
            "validation": validation,
            "vendor_mismatch": validation.get("vendor_mismatch", False),
            "price_deviation": validation.get("price_deviation", False),
            "no_matching_po": validation.get("no_matching_po", False),
        }

    def anomaly_node(state: PipelineState) -> PipelineState:
        result = anomaly_agent.run(
            state["extracted"], state.get("total_amount", 0.0), db
        )
        score = float(result.get("anomaly_score", 0.0))
        is_anomaly = bool(result.get("is_anomaly", False))
        invoice = db.get(Invoice, state["invoice_id"])
        invoice.anomaly_score = _to_decimal(round(score, 4))
        invoice.is_anomaly = is_anomaly
        db.commit()
        _log(
            db,
            state["invoice_id"],
            "AnomalyAgent",
            "Scored invoice anomaly",
            f"IsolationForest anomaly score = {score:.4f}, is_anomaly={is_anomaly}.",
            severity="warning" if (score >= 0.5 or is_anomaly) else "info",
        )
        return {"anomaly_score": score, "is_anomaly": is_anomaly}

    def memory_node(state: PipelineState) -> PipelineState:
        invoice = db.get(Invoice, state["invoice_id"])
        vendor = invoice.vendor_name or ""
        validation = state.get("validation", {})
        flags = validation.get("flags") or []
        query_text = (
            f"Vendor {vendor or 'unknown'} invoice total "
            f"{float(invoice.total_amount) if invoice.total_amount is not None else 0}, "
            f"anomaly {state.get('anomaly_score', 0.0):.2f}. Flags: "
            + ("; ".join(flags) if flags else "none")
        )
        stats = memory_service.vendor_history_stats(db, vendor)
        similar = memory_service.retrieve_similar(db, vendor, query_text, k=5)
        context = memory_service.format_context(stats, similar)
        _log(
            db,
            state["invoice_id"],
            "MemoryAgent",
            "Retrieved decision memory",
            context,
            severity="info",
        )
        return {
            "vendor_stats": stats,
            "similar_memories": similar,
            "memory_context": context,
        }

    def router_node(state: PipelineState) -> PipelineState:
        base = router_agent.decide(
            state.get("validation", {}),
            state.get("anomaly_score", 0.0),
            state.get("is_anomaly", False),
        )
        decision = router_agent.memory_aware_adjust(
            base,
            state.get("validation", {}),
            state.get("anomaly_score", 0.0),
            state.get("vendor_stats", {}),
            state.get("similar_memories", []),
        )
        if decision.get("memory_adjusted"):
            _log(
                db,
                state["invoice_id"],
                "MemoryAgent",
                "Memory-based override",
                decision.get("memory_note", ""),
                severity="warning",
            )
        severity = "critical" if decision["status"] == "rejected" else (
            "warning" if decision["status"] == "escalated" else "info"
        )
        _log(
            db,
            state["invoice_id"],
            "RouterAgent",
            f"Decision: {decision['status']}",
            decision["reason"],
            severity=severity,
        )
        return {"decision": decision}

    def escalate_email_node(state: PipelineState) -> PipelineState:
        invoice = db.get(Invoice, state["invoice_id"])
        validation = state.get("validation", {})
        sent = email_service.send_escalation_email(
            invoice.id,
            invoice.vendor_name or "",
            state["decision"]["reason"],
            total_amount=float(invoice.total_amount) if invoice.total_amount is not None else None,
            anomaly_score=state.get("anomaly_score"),
            flags=validation.get("flags") or [],
        )
        _log(
            db,
            state["invoice_id"],
            "RouterAgent",
            "Escalation email",
            "Escalation email sent." if sent else "Escalation email skipped/failed (see logs).",
            severity="warning",
        )
        return {}

    def finalize_node(state: PipelineState) -> PipelineState:
        invoice = db.get(Invoice, state["invoice_id"])
        decision = state["decision"]
        invoice.status = decision["status"]
        invoice.processed_at = datetime.now(timezone.utc)
        db.commit()
        # Persist this decision into vector memory for future RAG-augmented routing.
        flags = (state.get("validation", {}) or {}).get("flags") or []
        memory_service.record_decision(db, invoice, decision["status"], flags, source="auto")
        return {}

    return {
        "extractor": extractor_node,
        "validator": validator_node,
        "anomaly": anomaly_node,
        "memory": memory_node,
        "router": router_node,
        "escalate_email": escalate_email_node,
        "finalize": finalize_node,
    }


def _route_after_router(state: PipelineState) -> str:
    """Conditional edge: escalated invoices go through the email node first."""
    if state.get("decision", {}).get("status") == "escalated":
        return "escalate_email"
    return "finalize"


def _build_graph(db: Session):
    nodes = _make_nodes(db)
    graph = StateGraph(PipelineState)
    for name, fn in nodes.items():
        graph.add_node(name, fn)

    graph.add_edge(START, "extractor")
    graph.add_edge("extractor", "validator")
    graph.add_edge("validator", "anomaly")
    graph.add_edge("anomaly", "memory")
    graph.add_edge("memory", "router")
    graph.add_conditional_edges(
        "router",
        _route_after_router,
        {"escalate_email": "escalate_email", "finalize": "finalize"},
    )
    graph.add_edge("escalate_email", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()


def run_pipeline(invoice_id: int, pdf_bytes: bytes, filename: str) -> None:
    """Entry point executed as a background task after upload."""
    db = SessionLocal()
    try:
        app = _build_graph(db)
        app.invoke(
            {
                "invoice_id": invoice_id,
                "pdf_bytes": pdf_bytes,
                "filename": filename,
            }
        )
    except Exception as exc:  # noqa: BLE001 - mark invoice failed rather than hang
        logger.exception("Pipeline failed for invoice %s: %s", invoice_id, exc)
        try:
            invoice = db.get(Invoice, invoice_id)
            if invoice and invoice.status in ("pending", "processing"):
                invoice.status = "escalated"
                invoice.processed_at = datetime.now(timezone.utc)
                db.add(
                    AuditLog(
                        invoice_id=invoice_id,
                        agent_name="Supervisor",
                        action="Pipeline error",
                        detail=str(exc)[:2000],
                        severity="critical",
                    )
                )
                db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
    finally:
        db.close()
