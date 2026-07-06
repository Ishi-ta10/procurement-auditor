"""Dashboard summary route."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Invoice
from schemas import AnomalyBucket, DashboardSummary

router = APIRouter(tags=["dashboard"])

# Anomaly score buckets across [0, 1].
_BUCKETS = [
    ("0.0–0.2", 0.0, 0.2),
    ("0.2–0.4", 0.2, 0.4),
    ("0.4–0.6", 0.4, 0.6),
    ("0.6–0.8", 0.6, 0.8),
    ("0.8–1.0", 0.8, 1.0001),
]


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(db: Session = Depends(get_db)):
    """Aggregate dashboard metrics."""
    total = db.query(func.count(Invoice.id)).scalar() or 0

    status_rows = (
        db.query(Invoice.status, func.count(Invoice.id))
        .group_by(Invoice.status)
        .all()
    )
    status_breakdown = {status: count for status, count in status_rows}
    approved = status_breakdown.get("approved", 0)
    auto_approved_pct = round((approved / total) * 100, 1) if total else 0.0

    # Flagged today = invoices escalated/rejected with processed_at today (UTC).
    today = datetime.now(timezone.utc).date()
    flagged_today = (
        db.query(func.count(Invoice.id))
        .filter(
            Invoice.status.in_(("escalated", "rejected")),
            func.date(Invoice.processed_at) == today,
        )
        .scalar()
        or 0
    )

    scores = [
        float(s)
        for (s,) in db.query(Invoice.anomaly_score)
        .filter(Invoice.anomaly_score.isnot(None))
        .all()
    ]
    distribution: list[AnomalyBucket] = []
    for label, lo, hi in _BUCKETS:
        count = sum(1 for s in scores if lo <= s < hi)
        distribution.append(AnomalyBucket(label=label, count=count))

    return DashboardSummary(
        total_invoices=total,
        auto_approved_pct=auto_approved_pct,
        flagged_today=flagged_today,
        status_breakdown=status_breakdown,
        anomaly_score_distribution=distribution,
    )
