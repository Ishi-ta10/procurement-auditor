"""ExtractorAgent: parse a PDF into structured invoice JSON using pdfplumber + Groq.

The Groq (Llama 3.x) response is validated against Pydantic models so the rest of the
pipeline always receives a well-formed structure regardless of what the LLM returns.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator

from config import get_settings

logger = logging.getLogger(__name__)

# Groq model. NOTE: `llama-3.1-70b-versatile` was decommissioned by Groq; the current
# recommended production model is `llama-3.3-70b-versatile`.
GROQ_MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = (
    "You are an invoice data extraction engine. You are given the raw text of an "
    "invoice PDF. Return ONLY a valid JSON object (no markdown, no prose) with this "
    "exact shape:\n"
    '{"vendor": str, "invoice_number": str, "invoice_date": "YYYY-MM-DD", '
    '"po_number": str, "total": float, "line_items": [{"description": str, '
    '"quantity": int, "unit_price": float}]}\n'
    "Rules:\n"
    "- invoice_date MUST be ISO format YYYY-MM-DD (convert if needed).\n"
    "- quantity is an integer; unit_price and total are numbers (no currency symbols).\n"
    "- If a field is missing from the text, use an empty string (empty list for "
    "line_items, 0 for numbers). Never invent data.\n"
    "Respond with JSON only."
)


class LineItemSchema(BaseModel):
    """A single extracted invoice line item."""

    description: str = ""
    quantity: int = 0
    unit_price: float = 0.0

    @field_validator("description", mode="before")
    @classmethod
    def _coerce_description(cls, v: Any) -> str:
        return "" if v is None else str(v)

    @field_validator("quantity", mode="before")
    @classmethod
    def _coerce_quantity(cls, v: Any) -> int:
        try:
            return int(float(v)) if v not in (None, "") else 0
        except (TypeError, ValueError):
            return 0

    @field_validator("unit_price", mode="before")
    @classmethod
    def _coerce_price(cls, v: Any) -> float:
        try:
            return float(str(v).replace(",", "").replace("$", "")) if v not in (None, "") else 0.0
        except (TypeError, ValueError):
            return 0.0


class InvoiceExtraction(BaseModel):
    """Schema the LLM output is coerced/validated into."""

    vendor: str = ""
    invoice_number: str = ""
    invoice_date: str = ""
    po_number: str = ""
    total: float = 0.0
    line_items: list[LineItemSchema] = Field(default_factory=list)

    @field_validator("vendor", "invoice_number", "invoice_date", "po_number", mode="before")
    @classmethod
    def _coerce_str(cls, v: Any) -> str:
        return "" if v is None else str(v).strip()

    @field_validator("total", mode="before")
    @classmethod
    def _coerce_total(cls, v: Any) -> float:
        try:
            return float(str(v).replace(",", "").replace("$", "")) if v not in (None, "") else 0.0
        except (TypeError, ValueError):
            return 0.0


def _empty_result(reason: str) -> dict[str, Any]:
    """Return a safe empty extraction payload that still validates."""
    data = InvoiceExtraction().model_dump()
    data["_extraction_note"] = reason
    return data


def extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract raw text (and simple table text) from PDF bytes using pdfplumber."""
    try:
        import io

        import pdfplumber

        text_parts: list[str] = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if page_text:
                    text_parts.append(page_text)
                for table in page.extract_tables() or []:
                    for row in table:
                        cells = [c for c in row if c]
                        if cells:
                            text_parts.append(" | ".join(cells))
        return "\n".join(text_parts).strip()
    except Exception as exc:  # noqa: BLE001 - defensive: never crash the pipeline
        logger.warning("pdfplumber extraction failed: %s", exc)
        return ""


def _call_groq(raw_text: str) -> dict[str, Any] | None:
    """Send raw text to Groq (Llama 3.3 70B) and parse the JSON response."""
    settings = get_settings()
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set; skipping LLM extraction.")
        return None
    try:
        from groq import Groq

        client = Groq(api_key=settings.GROQ_API_KEY)
        completion = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": raw_text[:12000]},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        content = completion.choices[0].message.content or ""
        return json.loads(content)
    except Exception as exc:  # noqa: BLE001 - defensive fallback
        logger.warning("Groq extraction failed: %s", exc)
        return None


def _validate(data: dict[str, Any]) -> dict[str, Any]:
    """Validate/coerce the raw LLM dict into the enforced Pydantic schema."""
    try:
        model = InvoiceExtraction.model_validate(data)
    except ValidationError as exc:
        logger.warning("Extraction failed schema validation: %s", exc)
        return _empty_result("LLM output failed schema validation.")
    return model.model_dump()


def run(pdf_bytes: bytes, filename: str) -> dict[str, Any]:
    """Extract structured invoice data from a PDF.

    Falls back gracefully to an empty (but valid) structure if parsing fails so the
    downstream pipeline never crashes on a malformed PDF.
    """
    raw_text = extract_pdf_text(pdf_bytes)
    if not raw_text:
        return _empty_result("Could not extract any text from the PDF.")

    parsed = _call_groq(raw_text)
    if parsed is None:
        return _empty_result("LLM extraction unavailable; stored raw text only.")

    return _validate(parsed)
