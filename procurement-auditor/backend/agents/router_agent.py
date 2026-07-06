"""RouterAgent: final decision logic based on validation flags + anomaly result.

The decision is optionally refined with RAG memory of past decisions: when the base
rules escalate a borderline invoice but the vendor has a strong, consistent history of
such cases being approved, a memory-aware LLM reviewer may auto-approve it. Rejections
and hard failures are never softened.
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Guardrails: memory may only downgrade escalate→approve within these bounds.
_MIN_HISTORY = 3
_MIN_APPROVAL_RATE = 0.8
_MAX_ANOMALY_FOR_DOWNGRADE = 0.8


def decide(
    validation: dict[str, Any],
    anomaly_score: float,
    is_anomaly: bool = False,
) -> dict[str, str]:
    """Return the routing decision.

    Rules:
      - vendor hard mismatch OR anomaly_score >= 0.9        → reject
      - any validation flag OR is_anomaly OR score >= 0.5   → escalate (email)
      - otherwise                                           → approve
    """
    flags = validation.get("flags") or []
    vendor_mismatch = validation.get("vendor_mismatch", False)

    if vendor_mismatch or anomaly_score >= 0.9:
        return {
            "status": "rejected",
            "reason": _reason(flags, anomaly_score, is_anomaly, "Severe mismatch — rejected."),
        }

    if flags or is_anomaly or anomaly_score >= 0.5:
        return {
            "status": "escalated",
            "reason": _reason(flags, anomaly_score, is_anomaly, "Flagged for human review."),
        }

    return {
        "status": "approved",
        "reason": _reason(flags, anomaly_score, is_anomaly, "Clean invoice — auto-approved."),
    }


def _reason(flags: list[str], anomaly_score: float, is_anomaly: bool, headline: str) -> str:
    parts = [headline, f"Anomaly score: {anomaly_score:.4f} (is_anomaly={is_anomaly})."]
    if flags:
        parts.append("Flags: " + "; ".join(flags))
    return " ".join(parts)


def memory_aware_adjust(
    base_decision: dict[str, str],
    validation: dict[str, Any],
    anomaly_score: float,
    vendor_stats: dict[str, Any],
    similar: list[dict[str, Any]],
) -> dict[str, Any]:
    """Refine the base decision using vendor history + similar past decisions.

    Only an *escalated* decision may be downgraded to *approved*, and only when
    guardrails pass and a memory-aware LLM agrees. Returns the (possibly adjusted)
    decision plus a ``memory_note`` explaining the reasoning.
    """
    note = "Memory not consulted."
    if base_decision.get("status") != "escalated":
        return {**base_decision, "memory_adjusted": False, "memory_note": note}

    vendor_mismatch = validation.get("vendor_mismatch", False)
    total = int(vendor_stats.get("total", 0))
    approval_rate = float(vendor_stats.get("approval_rate", 0.0))
    rejected = int(vendor_stats.get("rejected", 0))

    # Hard guardrails before we even ask the LLM.
    guardrails_ok = (
        not vendor_mismatch
        and total >= _MIN_HISTORY
        and approval_rate >= _MIN_APPROVAL_RATE
        and rejected == 0
        and anomaly_score < _MAX_ANOMALY_FOR_DOWNGRADE
    )
    if not guardrails_ok:
        note = (
            "Vendor history insufficient to auto-approve "
            f"(prior={total}, approval_rate={approval_rate:.0%}, rejected={rejected}); "
            "kept escalated."
        )
        return {**base_decision, "memory_adjusted": False, "memory_note": note}

    verdict = _llm_review(base_decision["reason"], vendor_stats, similar, anomaly_score)
    if verdict and verdict.get("decision") == "approve":
        reason = (
            "Auto-approved via memory: strong vendor precedent. "
            f"{verdict.get('reason', '').strip()}"
        )
        return {"status": "approved", "reason": reason, "memory_adjusted": True, "memory_note": reason}

    note = (verdict.get("reason") if verdict else "Memory review kept escalation.") or note
    return {**base_decision, "memory_adjusted": False, "memory_note": note}


def _llm_review(
    base_reason: str,
    vendor_stats: dict[str, Any],
    similar: list[dict[str, Any]],
    anomaly_score: float,
) -> dict[str, Any] | None:
    """Ask Groq whether a borderline escalation should be auto-approved. Conservative."""
    from config import get_settings

    settings = get_settings()
    if not settings.GROQ_API_KEY:
        return None

    similar_text = "\n".join(
        f"- [{s['status']}] {s['summary']}" for s in similar[:5]
    ) or "None."
    system = (
        "You are a conservative procurement approval assistant. An invoice was escalated "
        "for human review. Decide whether the vendor's history justifies AUTO-APPROVING it "
        "instead. Approve ONLY if the vendor has a strong, consistent record of these same "
        "issues being accepted. When in doubt, keep it escalated. "
        'Respond with JSON only: {"decision": "approve" | "escalate", "reason": "<short>"}'
    )
    user = (
        f"Current escalation reason: {base_reason}\n"
        f"Anomaly score: {anomaly_score:.4f}\n"
        f"Vendor stats: {json.dumps(vendor_stats)}\n"
        f"Similar past decisions:\n{similar_text}"
    )
    try:
        from groq import Groq

        client = Groq(api_key=settings.GROQ_API_KEY)
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        content = completion.choices[0].message.content or "{}"
        data = json.loads(content)
        if data.get("decision") in ("approve", "escalate"):
            return data
        return None
    except Exception as exc:  # noqa: BLE001 - never break routing on LLM error
        logger.warning("Memory LLM review failed: %s", exc)
        return None
