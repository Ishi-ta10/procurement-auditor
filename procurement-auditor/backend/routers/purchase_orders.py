"""Purchase order routes (reference / debugging)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import PurchaseOrder
from schemas import PurchaseOrderOut

router = APIRouter(tags=["purchase_orders"])


@router.get("/purchase-orders", response_model=list[PurchaseOrderOut])
def list_purchase_orders(db: Session = Depends(get_db)):
    """List all purchase orders."""
    return db.query(PurchaseOrder).order_by(PurchaseOrder.order_date.desc()).all()
