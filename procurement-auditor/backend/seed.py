"""Seed script: sample purchase orders + synthetic historical invoices.

Generates ~300 approved historical invoices so the IsolationForest anomaly model has a
realistic baseline to train on. Idempotent: synthetic invoices are tagged with a marker
and skipped if already present.

Run with:  python seed.py            (default: 300 synthetic invoices)
           python seed.py 400        (custom count)
"""
from __future__ import annotations

import random
import sys
from datetime import date, timedelta
from decimal import Decimal

from database import SessionLocal
from models import AuditLog, Invoice, InvoiceLineItem, PurchaseOrder

SYNTHETIC_MARKER = "synthetic-seed"

# (vendor, item, unit_price, quantity)
CATALOG = [
    ("Acme Office Supplies", "A4 Paper Ream", Decimal("4.50"), 200),
    ("Globex Hardware", "USB-C Cable 2m", Decimal("9.99"), 150),
    ("Initech Software", "Team License (seat)", Decimal("49.00"), 60),
    ("Umbrella Logistics", "Pallet Shipping", Decimal("120.00"), 40),
    ("Stark Industrial", "Steel Bracket", Decimal("15.75"), 300),
    ("Wayne Facilities", "HVAC Filter", Decimal("32.00"), 80),
    ("Soylent Foods", "Catering Tray", Decimal("85.00"), 25),
    ("Hooli Cloud", "Compute Credit (100)", Decimal("75.00"), 50),
    ("Pied Piper Storage", "Archive Box", Decimal("6.25"), 500),
    ("Cyberdyne Robotics", "Servo Motor", Decimal("210.00"), 20),
]


def seed_purchase_orders(db) -> list[PurchaseOrder]:
    existing = {po.po_number: po for po in db.query(PurchaseOrder).all()}
    pos: list[PurchaseOrder] = []
    for idx, (vendor, item, price, qty) in enumerate(CATALOG, start=1):
        po_number = f"PO-{1000 + idx}"
        if po_number in existing:
            pos.append(existing[po_number])
            continue
        po = PurchaseOrder(
            po_number=po_number,
            vendor_name=vendor,
            item_description=item,
            unit_price=price,
            quantity=qty,
            total_amount=(price * qty),
            order_date=date.today() - timedelta(days=random.randint(400, 800)),
        )
        db.add(po)
        pos.append(po)
    db.commit()
    for po in pos:
        db.refresh(po)
    return pos


def seed_invoices(db, pos: list[PurchaseOrder], count: int) -> int:
    already = (
        db.query(Invoice)
        .filter(Invoice.filename.like(f"{SYNTHETIC_MARKER}%"))
        .count()
    )
    if already >= count:
        print(f"Already have {already} synthetic invoices (>= {count}); skipping.")
        return 0

    to_create = count - already
    start = date.today() - timedelta(days=730)
    created = 0
    for i in range(to_create):
        po = random.choice(pos)
        # Prices vary +/- ~8% around the PO unit price; a few outliers for spread.
        jitter = random.gauss(1.0, 0.05)
        if random.random() < 0.05:  # ~5% mild outliers
            jitter *= random.choice([0.6, 1.6])
        unit_price = (po.unit_price * Decimal(str(round(max(0.1, jitter), 3)))).quantize(
            Decimal("0.01")
        )
        n_lines = random.randint(1, 4)
        inv_date = start + timedelta(days=random.randint(0, 728))

        invoice = Invoice(
            filename=f"{SYNTHETIC_MARKER}-{already + i + 1}.pdf",
            vendor_name=po.vendor_name,
            invoice_number=f"INV-{100000 + already + i}",
            po_number=po.po_number,
            invoice_date=inv_date,
            status="approved",
            is_anomaly=False,
            raw_extracted_json={"source": SYNTHETIC_MARKER},
        )
        db.add(invoice)
        db.flush()  # get invoice.id

        total = Decimal("0")
        for _ in range(n_lines):
            qty = random.randint(1, max(2, po.quantity // 20))
            line_total = (unit_price * qty).quantize(Decimal("0.01"))
            total += line_total
            db.add(
                InvoiceLineItem(
                    invoice_id=invoice.id,
                    description=po.item_description,
                    quantity=qty,
                    unit_price=unit_price,
                    line_total=line_total,
                )
            )
        invoice.total_amount = total
        db.add(
            AuditLog(
                invoice_id=invoice.id,
                agent_name="Seed",
                action="Synthetic historical invoice",
                detail="Generated for anomaly-model training baseline.",
                severity="info",
            )
        )
        created += 1
        if created % 100 == 0:
            db.commit()
    db.commit()
    return created


def main() -> None:
    count = 300
    if len(sys.argv) > 1:
        try:
            count = max(1, int(sys.argv[1]))
        except ValueError:
            pass

    db = SessionLocal()
    try:
        pos = seed_purchase_orders(db)
        print(f"Purchase orders ready: {len(pos)}")
        created = seed_invoices(db, pos, count)
        print(f"Synthetic invoices created: {created}")
        total_inv = db.query(Invoice).count()
        print(f"Total invoices in DB: {total_inv}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
