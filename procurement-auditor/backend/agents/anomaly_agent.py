"""AnomalyAgent: score an invoice with an IsolationForest model.

Feature engineering (per invoice):
  - unit_price_zscore:      average line-item unit price, z-scored vs history
  - total_zscore:           invoice total, z-scored vs history
  - days_since_last_invoice: gap (days) since the previous invoice from the vendor
  - line_item_count:        number of line items

The fitted model and the population statistics used for z-scoring are pickled together
so scoring stays consistent across restarts. Scores are normalized to [0, 1] where a
value close to 1 indicates an anomaly; `is_anomaly` comes from IsolationForest.predict.
"""
from __future__ import annotations

import logging
import os
import pickle
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from models import Invoice

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "anomaly_model.pkl")
FEATURE_KEYS = (
    "unit_price_zscore",
    "total_zscore",
    "days_since_last_invoice",
    "line_item_count",
)


def _mean_std(values: list[float]) -> tuple[float, float]:
    """Return (mean, std) with a guard against zero/near-zero variance."""
    if not values:
        return 0.0, 1.0
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / len(values)
    std = var ** 0.5
    return mean, (std if std > 1e-9 else 1.0)


def _zscore(value: float, mean: float, std: float) -> float:
    return (value - mean) / std


def _historical_rows(db: Session) -> list[dict[str, Any]]:
    """Collect raw per-invoice measurements from historical invoices."""
    from sqlalchemy.orm import selectinload

    rows = (
        db.query(Invoice)
        .options(selectinload(Invoice.line_items))
        .filter(Invoice.total_amount.isnot(None))
        .order_by(Invoice.invoice_date.asc().nullslast(), Invoice.id.asc())
        .all()
    )
    last_by_vendor: dict[str, date] = {}
    out: list[dict[str, Any]] = []
    for inv in rows:
        items = inv.line_items or []
        total = float(inv.total_amount or 0)
        qty = sum(int(li.quantity or 0) for li in items) or 1
        avg_price = (
            sum(float(li.unit_price or 0) for li in items) / len(items)
            if items
            else (total / qty if qty else 0.0)
        )
        vendor = (inv.vendor_name or "").strip().lower()
        days_since = 0.0
        if inv.invoice_date and vendor in last_by_vendor:
            days_since = float((inv.invoice_date - last_by_vendor[vendor]).days)
        if inv.invoice_date:
            last_by_vendor[vendor] = inv.invoice_date
        out.append(
            {
                "avg_price": avg_price,
                "total": total,
                "days_since_last_invoice": max(0.0, days_since),
                "line_item_count": float(len(items)),
            }
        )
    return out


def _compute_stats(rows: list[dict[str, Any]]) -> dict[str, tuple[float, float]]:
    """Population mean/std used for z-scoring."""
    return {
        "avg_price": _mean_std([r["avg_price"] for r in rows]),
        "total": _mean_std([r["total"] for r in rows]),
    }


def _row_to_features(row: dict[str, Any], stats: dict[str, tuple[float, float]]) -> list[float]:
    price_mean, price_std = stats["avg_price"]
    total_mean, total_std = stats["total"]
    return [
        _zscore(row["avg_price"], price_mean, price_std),
        _zscore(row["total"], total_mean, total_std),
        row["days_since_last_invoice"],
        row["line_item_count"],
    ]


def _current_features(
    extracted: dict[str, Any],
    total_amount: float,
    stats: dict[str, tuple[float, float]],
    db: Session,
) -> list[float]:
    line_items = extracted.get("line_items") or []
    qty = sum(int(li.get("quantity") or 0) for li in line_items) or 1
    avg_price = (
        sum(float(li.get("unit_price") or 0) for li in line_items) / len(line_items)
        if line_items
        else (total_amount / qty if qty else 0.0)
    )

    # days since the vendor's previous invoice
    days_since = 0.0
    vendor = (extracted.get("vendor") or "").strip().lower()
    inv_date_str = extracted.get("invoice_date") or ""
    if vendor and inv_date_str:
        try:
            from datetime import datetime

            inv_date = datetime.strptime(inv_date_str, "%Y-%m-%d").date()
            prev = (
                db.query(Invoice.invoice_date)
                .filter(
                    func_lower(Invoice.vendor_name) == vendor,
                    Invoice.invoice_date.isnot(None),
                    Invoice.invoice_date < inv_date,
                )
                .order_by(Invoice.invoice_date.desc())
                .first()
            )
            if prev and prev[0]:
                days_since = float((inv_date - prev[0]).days)
        except (ValueError, TypeError):
            days_since = 0.0

    row = {
        "avg_price": avg_price,
        "total": float(total_amount),
        "days_since_last_invoice": max(0.0, days_since),
        "line_item_count": float(len(line_items)),
    }
    return _row_to_features(row, stats)


def func_lower(column):
    """Lazy import wrapper for SQL lower() to keep top-level imports minimal."""
    from sqlalchemy import func

    return func.lower(column)


def train_model(db: Session) -> dict[str, Any]:
    """Fit an IsolationForest on historical invoices and pickle it with stats."""
    from sklearn.ensemble import IsolationForest

    rows = _historical_rows(db)
    stats = _compute_stats(rows) if rows else {"avg_price": (0.0, 1.0), "total": (0.0, 1.0)}

    model = IsolationForest(n_estimators=100, contamination="auto", random_state=42)
    features = [_row_to_features(r, stats) for r in rows]
    if len(features) >= 2:
        model.fit(features)
    else:
        # Not enough history — fit a tiny synthetic baseline so scoring still works.
        model.fit([[0.0, 0.0, 0.0, 1.0], [3.0, 3.0, 60.0, 10.0]])

    bundle = {"model": model, "stats": stats, "n_samples": len(features)}
    with open(MODEL_PATH, "wb") as fh:
        pickle.dump(bundle, fh)
    logger.info("Trained anomaly model on %d historical invoices.", len(features))
    return bundle


def _load_or_train(db: Session) -> dict[str, Any]:
    if os.path.exists(MODEL_PATH):
        try:
            with open(MODEL_PATH, "rb") as fh:
                bundle = pickle.load(fh)
            if isinstance(bundle, dict) and "model" in bundle and "stats" in bundle:
                return bundle
            logger.info("Anomaly model format outdated; retraining.")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to load anomaly model, retraining: %s", exc)
    return train_model(db)


def warm_start(db: Session) -> None:
    """Ensure a model exists at application startup (loads or trains once)."""
    try:
        _load_or_train(db)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Anomaly model warm start failed: %s", exc)


def run(
    extracted: dict[str, Any],
    total_amount: float,
    db: Session,
) -> dict[str, Any]:
    """Return {'anomaly_score': float in [0,1], 'is_anomaly': bool}."""
    try:
        bundle = _load_or_train(db)
        model = bundle["model"]
        stats = bundle["stats"]
        feature = [_current_features(extracted, total_amount, stats, db)]

        # decision_function: higher = more normal. Map to [0,1] anomaly score.
        raw = float(model.decision_function(feature)[0])
        score = 1.0 / (1.0 + pow(2.718281828, raw * 4))
        score = max(0.0, min(1.0, round(score, 4)))
        is_anomaly = int(model.predict(feature)[0]) == -1
        return {"anomaly_score": score, "is_anomaly": bool(is_anomaly)}
    except Exception as exc:  # noqa: BLE001 - never crash the pipeline
        logger.warning("Anomaly scoring failed, defaulting to 0.5: %s", exc)
        return {"anomaly_score": 0.5, "is_anomaly": False}
