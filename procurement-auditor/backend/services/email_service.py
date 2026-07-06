"""Email service: send escalation alerts via Gmail SMTP."""
from __future__ import annotations

import html
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

from config import get_settings

logger = logging.getLogger(__name__)


def send_escalation_email(
    invoice_id: int,
    vendor: str,
    reason: str,
    total_amount: Optional[float] = None,
    anomaly_score: Optional[float] = None,
    flags: Optional[list[str]] = None,
) -> bool:
    """Send an HTML escalation alert email. Returns True on success, False otherwise.

    Never raises — a failed email must not crash the agent pipeline.
    """
    settings = get_settings()
    if not settings.GMAIL_ADDRESS or not settings.GMAIL_APP_PASSWORD:
        logger.warning("Gmail credentials not configured; skipping escalation email.")
        return False

    flags = flags or []
    text_body = (
        f"Invoice #{invoice_id} has been escalated for review.\n\n"
        f"Vendor: {vendor or 'Unknown'}\n"
        f"Total: {total_amount if total_amount is not None else 'n/a'}\n"
        f"Anomaly score: {anomaly_score if anomaly_score is not None else 'n/a'}\n"
        f"Reason: {reason}\n"
        + ("Flags:\n- " + "\n- ".join(flags) + "\n" if flags else "")
        + "\nPlease review it in the Procurement Auditor dashboard."
    )
    html_body = _build_html(invoice_id, vendor, reason, total_amount, anomaly_score, flags)

    message = MIMEMultipart("alternative")
    message["Subject"] = f"[Procurement Auditor] Invoice #{invoice_id} escalated"
    message["From"] = settings.GMAIL_ADDRESS
    message["To"] = settings.GMAIL_ADDRESS
    message.attach(MIMEText(text_body, "plain"))
    message.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
            server.starttls()
            server.login(settings.GMAIL_ADDRESS, settings.GMAIL_APP_PASSWORD)
            server.send_message(message)
        logger.info("Escalation email sent for invoice %s", invoice_id)
        return True
    except Exception as exc:  # noqa: BLE001 - defensive
        logger.warning("Failed to send escalation email: %s", exc)
        return False


def _build_html(
    invoice_id: int,
    vendor: str,
    reason: str,
    total_amount: Optional[float],
    anomaly_score: Optional[float],
    flags: list[str],
) -> str:
    """Render a simple, email-client-safe HTML summary."""
    def esc(v: Any) -> str:
        return html.escape(str(v))

    flag_rows = (
        "".join(f"<li style='margin:4px 0;color:#b91c1c;'>{esc(f)}</li>" for f in flags)
        if flags
        else "<li style='color:#065f46;'>No validation flags.</li>"
    )
    total_str = f"${total_amount:,.2f}" if isinstance(total_amount, (int, float)) else "n/a"
    score_str = f"{anomaly_score:.4f}" if isinstance(anomaly_score, (int, float)) else "n/a"

    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;">
  <h2 style="color:#b45309;">Invoice #{esc(invoice_id)} escalated</h2>
  <p style="color:#374151;">This invoice was flagged by the automated procurement auditor
  and requires human review.</p>
  <table style="border-collapse:collapse;width:100%;margin:12px 0;">
    <tr><td style="padding:6px 8px;color:#6b7280;">Vendor</td>
        <td style="padding:6px 8px;font-weight:bold;">{esc(vendor or 'Unknown')}</td></tr>
    <tr><td style="padding:6px 8px;color:#6b7280;">Total</td>
        <td style="padding:6px 8px;font-weight:bold;">{esc(total_str)}</td></tr>
    <tr><td style="padding:6px 8px;color:#6b7280;">Anomaly score</td>
        <td style="padding:6px 8px;font-weight:bold;">{esc(score_str)}</td></tr>
  </table>
  <p style="color:#374151;"><strong>Decision reason:</strong> {esc(reason)}</p>
  <h3 style="color:#374151;margin-bottom:4px;">Flags</h3>
  <ul style="padding-left:20px;">{flag_rows}</ul>
  <p style="color:#9ca3af;font-size:12px;">Open the Procurement Auditor dashboard to approve or reject.</p>
</div>"""
