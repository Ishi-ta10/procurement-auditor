import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  Gauge,
  Hash,
  ListChecks,
  Receipt,
  X,
} from "lucide-react";
import { useApproveInvoice, useInvoice, useOverrideInvoice } from "../hooks/useApi";
import {
  AnomalyBar,
  Card,
  ErrorNote,
  Spinner,
  StatusBadge,
  anomalyMeta,
  formatDate,
  formatMoney,
  formatScore,
  severityMeta,
} from "../components/ui.jsx";

function Info({ icon: Icon, label, value }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="mt-1.5 truncate text-base font-semibold text-ink">{value}</div>
    </Card>
  );
}

function extractFlags(inv) {
  const entry = (inv.audit_entries || []).find((a) => a.agent_name === "ValidatorAgent");
  if (!entry?.detail || /no issues/i.test(entry.detail)) return [];
  return entry.detail
    .split(";")
    .map((f) => f.trim())
    .filter(Boolean);
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const { data: inv, isLoading, isError, error } = useInvoice(invoiceId);
  const override = useOverrideInvoice(invoiceId);
  const approve = useApproveInvoice(invoiceId);
  const [showJson, setShowJson] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 text-ink-muted">
        <Spinner /> Loading invoice…
      </div>
    );
  }
  if (isError) return <ErrorNote message={error.message} />;

  const am = anomalyMeta(inv.anomaly_score, inv.is_anomaly);
  const flags = extractFlags(inv);
  const busy = override.isPending || approve.isPending;

  return (
    <div className="space-y-6">
      <Link to="/invoices" className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to invoices
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 ring-1 ring-inset ring-brand-500/25 dark:text-brand-300">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Invoice #{inv.id}</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {inv.vendor_name || "Unknown vendor"} · {inv.filename}
            </p>
          </div>
        </div>
        <StatusBadge status={inv.status} />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Info icon={Hash} label="Invoice #" value={inv.invoice_number || "—"} />
        <Info icon={Building2} label="PO #" value={inv.po_number || "—"} />
        <Info icon={FileText} label="Total" value={formatMoney(inv.total_amount)} />
        <Info icon={CalendarDays} label="Invoice date" value={inv.invoice_date || "—"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Anomaly */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-brand-500 dark:text-brand-300" />
            <h2 className="section-title">Anomaly score</h2>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold text-ink">{formatScore(inv.anomaly_score)}</span>
            <span className={`text-sm font-medium ${am.text}`}>{am.label}</span>
          </div>
          <div className="mt-3">
            <AnomalyBar score={inv.anomaly_score} isAnomaly={inv.is_anomaly} />
          </div>
          {inv.is_anomaly && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-500/30 dark:text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              Flagged as anomaly by IsolationForest
            </div>
          )}
        </Card>

        {/* Validation flags */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-brand-500 dark:text-brand-300" />
            <h2 className="section-title">Validation flags</h2>
          </div>
          {flags.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300">
              <Check className="h-4 w-4" /> No validation issues detected.
            </div>
          ) : (
            <ul className="space-y-2">
              {flags.map((f, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 ring-1 ring-inset ring-amber-500/25 dark:text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Line items */}
      <Card>
        <div className="border-b border-edge px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Line items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-faint">
              <tr className="border-b border-edge">
                <th className="px-5 py-3 font-semibold">Description</th>
                <th className="px-5 py-3 font-semibold">Qty</th>
                <th className="px-5 py-3 font-semibold">Unit price</th>
                <th className="px-5 py-3 font-semibold">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/70">
              {inv.line_items?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-sm text-ink-faint">
                    No line items extracted.
                  </td>
                </tr>
              )}
              {inv.line_items?.map((li) => (
                <tr key={li.id} className="hover:bg-panel2/40">
                  <td className="px-5 py-3 text-ink-soft">{li.description || "—"}</td>
                  <td className="px-5 py-3 text-ink-muted">{li.quantity ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-muted">{formatMoney(li.unit_price)}</td>
                  <td className="px-5 py-3 font-medium text-ink-soft">{formatMoney(li.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Audit trail */}
      <Card>
        <div className="border-b border-edge px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Audit trail</h2>
        </div>
        <ol className="p-5">
          {inv.audit_entries?.map((entry, idx) => {
            const sm = severityMeta(entry.severity);
            const last = idx === inv.audit_entries.length - 1;
            return (
              <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
                {!last && <span className="absolute left-[7px] top-4 h-full w-px bg-edge" />}
                <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-panel ${sm.dot}`} />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{entry.agent_name}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${sm.chip}`}>
                      {entry.severity}
                    </span>
                    <span className="ml-auto text-xs text-ink-faint">{formatDate(entry.created_at)}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-ink-soft">{entry.action}</div>
                  {entry.detail && <div className="mt-1 text-xs leading-relaxed text-ink-muted">{entry.detail}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Extracted JSON */}
      <Card>
        <button
          onClick={() => setShowJson((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-semibold text-ink"
        >
          Raw extracted JSON
          <ChevronDown className={`h-4 w-4 text-ink-faint transition-transform ${showJson ? "rotate-180" : ""}`} />
        </button>
        {showJson && (
          <div className="border-t border-edge p-5">
            <pre className="max-h-96 overflow-auto rounded-lg bg-panel2 p-4 font-mono text-xs leading-relaxed text-ink-soft ring-1 ring-inset ring-edge">
              {JSON.stringify(inv.raw_extracted_json ?? {}, null, 2)}
            </pre>
          </div>
        )}
      </Card>

      {/* Actions */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">Human review</div>
          <p className="text-xs text-ink-muted">Override the automated decision for this invoice.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => approve.mutate()} disabled={busy} className="btn-success">
            <Check className="h-4 w-4" /> Approve
          </button>
          <button onClick={() => override.mutate("reject")} disabled={busy} className="btn-danger">
            <X className="h-4 w-4" /> Reject
          </button>
          {(override.isError || approve.isError) && (
            <span className="text-sm text-rose-600 dark:text-rose-400">
              {(override.error || approve.error)?.message}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
