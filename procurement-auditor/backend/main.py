"""FastAPI application entry point."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import get_settings
from database import engine
from routers import dashboard, invoices, model, purchase_orders

logging.basicConfig(level=logging.INFO)

settings = get_settings()

app = FastAPI(title="Multi-Agent Procurement Auditor", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(invoices.router)
app.include_router(purchase_orders.router)
app.include_router(dashboard.router)
app.include_router(model.router)


@app.on_event("startup")
def _warm_start_model() -> None:
    """Load (or train) the anomaly model once at startup so first request is fast."""
    from agents import anomaly_agent
    from database import SessionLocal

    db = SessionLocal()
    try:
        anomaly_agent.warm_start(db)
    except Exception:  # noqa: BLE001 - never block startup on model warm-up
        logging.getLogger(__name__).warning("Anomaly model warm start skipped.")
    finally:
        db.close()


@app.get("/health")
def health():
    """Health check that also verifies database connectivity."""
    db_status = "connected"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_status = "disconnected"
    return {"status": "ok", "db": db_status}
