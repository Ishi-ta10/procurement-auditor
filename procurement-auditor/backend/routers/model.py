"""Model routes: retrain the anomaly detection model on approved invoices."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from agents import anomaly_agent
from database import get_db

router = APIRouter(tags=["model"])


@router.get("/model/retrain")
def retrain_model(db: Session = Depends(get_db)):
    """Retrain the IsolationForest on current historical invoice data."""
    bundle = anomaly_agent.train_model(db)
    return {
        "status": "retrained",
        "samples": bundle.get("n_samples", 0),
        "features": list(anomaly_agent.FEATURE_KEYS),
    }
