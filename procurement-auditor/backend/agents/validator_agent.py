"""ValidatorAgent: cross-check extracted invoice data against purchase_orders.

Returns explicit boolean flags used by the router:
  - vendor_mismatch:  invoice vendor differs from the PO vendor
  - price_deviation:  any unit price or the total deviates > 5% from the PO
  - no_matching_po:   no PO number on the invoice, or PO not found in the database
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from models import PurchaseOrder

PRICE_TOLERANCE = Decimal("0.05")  # 5% difference threshold


def run(extracted: dict[str, Any], db: Session) -> dict[str, Any]:
    """Validate extracted data vs the referenced purchase order.

    Returns a dict with:
      - flags: list[str] of human-readable validation issues
      - vendor_mismatch: bool
      - price_deviation: bool
      - no_matching_po: bool
      - po_number: the matched PO number (or None)
    """
    flags: list[str] = []
    vendor_mismatch = False
    price_deviation = False
    no_matching_po = False
    po_number = (extracted.get("po_number") or "").strip()

    if not po_number:
        no_matching_po = True
        flags.append("No PO number found on invoice.")
        return {
            "flags": flags,
            "vendor_mismatch": vendor_mismatch,
            "price_deviation": price_deviation,
            "no_matching_po": no_matching_po,
            "po_number": None,
        }

    po = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.po_number == po_number)
        .one_or_none()
    )
    if po is None:
        no_matching_po = True
        flags.append(f"PO '{po_number}' not found in purchase_orders.")
        return {
            "flags": flags,
            "vendor_mismatch": vendor_mismatch,
            "price_deviation": price_deviation,
            "no_matching_po": no_matching_po,
            "po_number": po_number,
        }

    # Vendor comparison (case-insensitive).
    invoice_vendor = (extracted.get("vendor") or "").strip().lower()
    if invoice_vendor and invoice_vendor != po.vendor_name.strip().lower():
        vendor_mismatch = True
        flags.append(
            f"Vendor mismatch: invoice '{extracted.get('vendor')}' vs PO '{po.vendor_name}'."
        )

    line_items = extracted.get("line_items") or []
    total_qty = sum(int(li.get("quantity") or 0) for li in line_items)

    # Unit price check (flag if >5% difference on any line item).
    for li in line_items:
        unit_price = Decimal(str(li.get("unit_price") or 0))
        if unit_price <= 0 or po.unit_price <= 0:
            continue
        diff = abs(unit_price - po.unit_price) / po.unit_price
        if diff > PRICE_TOLERANCE:
            price_deviation = True
            flags.append(
                f"Unit price drift on '{li.get('description')}': "
                f"invoice {unit_price} vs PO {po.unit_price} ({diff:.0%})."
            )

    # Total check (flag if invoice total deviates > 5% from PO total).
    invoice_total = _invoice_total(extracted, line_items)
    if invoice_total > 0 and po.total_amount and po.total_amount > 0:
        total_diff = abs(invoice_total - po.total_amount) / po.total_amount
        if total_diff > PRICE_TOLERANCE:
            price_deviation = True
            flags.append(
                f"Total drift: invoice {invoice_total} vs PO {po.total_amount} "
                f"({total_diff:.0%})."
            )

    # Quantity check (flag if invoice exceeds PO quantity).
    if total_qty > po.quantity:
        flags.append(f"Quantity {total_qty} exceeds PO quantity {po.quantity}.")

    return {
        "flags": flags,
        "vendor_mismatch": vendor_mismatch,
        "price_deviation": price_deviation,
        "no_matching_po": no_matching_po,
        "po_number": po_number,
    }


def _invoice_total(extracted: dict[str, Any], line_items: list[dict[str, Any]]) -> Decimal:
    """Prefer the LLM-reported total; otherwise sum the line items."""
    reported = extracted.get("total")
    if reported:
        try:
            value = Decimal(str(reported))
            if value > 0:
                return value
        except (TypeError, ValueError):
            pass
    total = Decimal("0")
    for li in line_items:
        qty = Decimal(str(li.get("quantity") or 0))
        price = Decimal(str(li.get("unit_price") or 0))
        total += qty * price
    return total
