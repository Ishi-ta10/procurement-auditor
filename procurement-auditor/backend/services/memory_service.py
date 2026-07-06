"""Agent memory / RAG over past decisions.

Stores a natural-language summary + embedding of every finalized decision (and every
human override) in the ``decision_memory`` table, and retrieves semantically similar
past cases so the Router can reason over a vendor's history.

Embeddings use fastembed (BAAI/bge-small-en-v1.5, 384-dim, ONNX/CPU) which is light
enough for free-tier deploys. Everything degrades gracefully: if the embedder or the
pgvector table is unavailable, retrieval returns empty and the pipeline is unaffected.
"""
from __future__ import annotations

import logging
import os
from decimal import Decimal
from functools import lru_cache
from typing import Any, Optional

# On Windows without Developer Mode/admin, the HuggingFace cache can't create the
# symlinks fastembed uses, raising WinError 1314. Copying files instead avoids it.
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import AuditLog, DecisionMemory, Invoice

logger = logging.getLogger(__name__)

EMBED_DIM = 384
_MODEL_NAME = "BAAI/bge-small-en-v1.5"


@lru_cache(maxsize=1)
def _embedder():
    """Lazily construct and cache the fastembed model (downloads once)."""
    from fastembed import TextEmbedding

    return TextEmbedding(model_name=_MODEL_NAME)


def embed(text: str) -> Optional[list[float]]:
    """Return a 384-dim embedding for ``text`` or None if embedding is unavailable."""
    if not text or not text.strip():
        return None
    try:
        model = _embedder()
        vec = next(iter(model.embed([text])))
        return [float(x) for x in vec]
    except Exception as exc:  # noqa: BLE001 - never break the pipeline on embedding
        logger.warning("Embedding unavailable: %s", exc)
        return None


def warm_start() -> None:
    """Pre-load the embedding model at app startup (optional)."""
    try:
        _embedder()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Embedder warm start skipped: %s", exc)


def _decision_summary(invoice: Invoice, status: str, flags: list[str], source: str) -> str:
    vendor = invoice.vendor_name or "Unknown vendor"
    total = f"${float(invoice.total_amount):,.2f}" if invoice.total_amount is not None else "n/a"
    score = f"{float(invoice.anomaly_score):.2f}" if invoice.anomaly_score is not None else "n/a"
    flag_text = "; ".join(flags) if flags else "no validation flags"
    actor = "Human reviewer" if source == "human" else "Automated pipeline"
    return (
        f"{actor} decision '{status}' for vendor {vendor}. "
        f"Invoice total {total}, PO {invoice.po_number or 'none'}, anomaly score {score}. "
        f"Flags: {flag_text}."
    )


def record_decision(
    db: Session,
    invoice: Invoice,
    status: str,
    flags: Optional[list[str]] = None,
    source: str = "auto",
) -> None:
    """Persist a decision memory (summary + embedding). Never raises."""
    try:
        flags = flags or []
        summary = _decision_summary(invoice, status, flags, source)
        vec = embed(summary)
        if vec is None:
            return  # embedding unavailable → skip silently
        db.add(
            DecisionMemory(
                invoice_id=invoice.id,
                vendor_name=invoice.vendor_name,
                summary=summary,
                embedding=vec,
                status=status,
                is_override=(source == "human"),
                anomaly_score=invoice.anomaly_score,
                total_amount=invoice.total_amount,
                flags=flags,
            )
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.warning("Failed to record decision memory: %s", exc)


def retrieve_similar(
    db: Session,
    vendor: Optional[str],
    query_text: str,
    k: int = 5,
) -> list[dict[str, Any]]:
    """Return up to ``k`` semantically similar past decisions.

    Prefers the same vendor; if that yields nothing, searches globally.
    """
    vec = embed(query_text)
    if vec is None:
        return []
    try:
        def _run(filter_vendor: bool):
            q = db.query(
                DecisionMemory,
                DecisionMemory.embedding.cosine_distance(vec).label("dist"),
            )
            if filter_vendor and vendor:
                q = q.filter(func.lower(DecisionMemory.vendor_name) == vendor.strip().lower())
            return q.order_by("dist").limit(k).all()

        rows = _run(True) if vendor else _run(False)
        if not rows and vendor:
            rows = _run(False)

        out: list[dict[str, Any]] = []
        for mem, dist in rows:
            out.append(
                {
                    "summary": mem.summary,
                    "status": mem.status,
                    "is_override": mem.is_override,
                    "vendor_name": mem.vendor_name,
                    "similarity": round(1.0 - float(dist), 3),
                }
            )
        return out
    except Exception as exc:  # noqa: BLE001 - table may not exist yet
        logger.warning("Memory retrieval failed: %s", exc)
        return []


def vendor_history_stats(db: Session, vendor: Optional[str]) -> dict[str, Any]:
    """Aggregate a vendor's historical decision pattern from the invoices table."""
    empty = {
        "vendor": vendor,
        "total": 0,
        "approved": 0,
        "escalated": 0,
        "rejected": 0,
        "flagged": 0,
        "human_overrides": 0,
        "approval_rate": 0.0,
    }
    if not vendor:
        return empty
    try:
        v = vendor.strip().lower()
        rows = (
            db.query(Invoice.status, func.count(Invoice.id))
            .filter(func.lower(Invoice.vendor_name) == v)
            .group_by(Invoice.status)
            .all()
        )
        counts = {status: int(n) for status, n in rows}
        total = sum(counts.values())
        flagged = (
            db.query(func.count(Invoice.id))
            .filter(
                func.lower(Invoice.vendor_name) == v,
                (Invoice.is_anomaly.is_(True)) | (Invoice.anomaly_score >= Decimal("0.5")),
            )
            .scalar()
            or 0
        )
        overrides = (
            db.query(func.count(AuditLog.id))
            .join(Invoice, Invoice.id == AuditLog.invoice_id)
            .filter(
                func.lower(Invoice.vendor_name) == v,
                AuditLog.agent_name == "Human",
            )
            .scalar()
            or 0
        )
        approved = counts.get("approved", 0)
        return {
            "vendor": vendor,
            "total": total,
            "approved": approved,
            "escalated": counts.get("escalated", 0),
            "rejected": counts.get("rejected", 0),
            "flagged": int(flagged),
            "human_overrides": int(overrides),
            "approval_rate": round(approved / total, 3) if total else 0.0,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Vendor stats failed: %s", exc)
        return empty


def format_context(stats: dict[str, Any], similar: list[dict[str, Any]]) -> str:
    """Human-readable context string used in prompts and audit logs."""
    parts = [
        f"Vendor history: {stats['total']} prior invoices "
        f"({stats['approved']} approved, {stats['escalated']} escalated, "
        f"{stats['rejected']} rejected; {stats['flagged']} previously flagged; "
        f"{stats['human_overrides']} human overrides; "
        f"approval rate {stats['approval_rate']:.0%})."
    ]
    if similar:
        parts.append("Similar past decisions:")
        for i, s in enumerate(similar[:5], 1):
            parts.append(f"  {i}. [{s['status']}] {s['summary']} (sim {s['similarity']:.2f})")
    else:
        parts.append("No similar past decisions on record.")
    return "\n".join(parts)
