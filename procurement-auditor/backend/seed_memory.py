"""Backfill decision memory from existing finalized invoices.

Populates the ``decision_memory`` vector store so the Router has history to reason over
from day one. Idempotent: invoices already present in memory are skipped.

Run with:  python seed_memory.py            (default: up to 150 invoices)
           python seed_memory.py 300
"""
from __future__ import annotations

import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import SessionLocal
from models import AuditLog, DecisionMemory, Invoice
from services import memory_service


def _flags_from_audit(invoice: Invoice) -> list[str]:
    entry = next(
        (a for a in invoice.audit_entries if a.agent_name == "ValidatorAgent"), None
    )
    if not entry or not entry.detail or "no issues" in entry.detail.lower():
        return []
    return [f.strip() for f in entry.detail.split(";") if f.strip()]


def _is_human(invoice: Invoice) -> bool:
    return any(a.agent_name == "Human" for a in invoice.audit_entries)


def main() -> None:
    limit = 150
    if len(sys.argv) > 1:
        try:
            limit = max(1, int(sys.argv[1]))
        except ValueError:
            pass

    db = SessionLocal()
    try:
        existing = {mid for (mid,) in db.execute(select(DecisionMemory.invoice_id)).all() if mid}
        invoices = (
            db.query(Invoice)
            .options(selectinload(Invoice.audit_entries))
            .filter(
                Invoice.status.in_(("approved", "escalated", "rejected")),
                Invoice.vendor_name.isnot(None),
            )
            .order_by(Invoice.id.desc())
            .limit(limit)
            .all()
        )
        created = 0
        for inv in invoices:
            if inv.id in existing:
                continue
            source = "human" if _is_human(inv) else "auto"
            memory_service.record_decision(db, inv, inv.status, _flags_from_audit(inv), source)
            created += 1
            if created % 25 == 0:
                print(f"  …recorded {created} memories")
        total = db.query(DecisionMemory).count()
        print(f"Backfilled {created} new memories. Total in store: {total}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
