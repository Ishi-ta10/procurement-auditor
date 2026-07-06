import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileStack, Search, UploadCloud } from "lucide-react";
import { useInvoices } from "../hooks/useApi";
import {
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  StatusBadge,
  anomalyMeta,
  formatDateShort,
  formatMoney,
  formatScore,
} from "../components/ui.jsx";
import { exportCsv } from "../lib/csv.js";

const TABS = [
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "escalated", label: "Escalated" },
  { key: "rejected", label: "Rejected" },
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
];

export default function Invoices() {
  const { data, isLoading, isError, error } = useInvoices();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");

  const all = data ?? [];

  const counts = useMemo(() => {
    const c = { all: all.length };
    for (const inv of all) c[inv.status] = (c[inv.status] || 0) + 1;
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((inv) => {
      if (tab !== "all" && inv.status !== tab) return false;
      if (!needle) return true;
      return [inv.vendor_name, inv.invoice_number, inv.po_number, `#${inv.id}`, `${inv.id}`]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [all, tab, q]);

  const handleExport = () =>
    exportCsv(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      { key: "id", label: "ID" },
      { key: "vendor_name", label: "Vendor" },
      { key: "invoice_number", label: "Invoice #" },
      { key: "po_number", label: "PO" },
      { key: "total_amount", label: "Total" },
      { key: "status", label: "Status" },
      { key: "anomaly_score", label: "Anomaly Score" },
      { key: "is_anomaly", label: "Is Anomaly" },
      { key: "invoice_date", label: "Invoice Date" },
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        subtitle="Every invoice processed by the multi-agent pipeline."
        icon={FileStack}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="btn-secondary" disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> Export
            </button>
            <Link to="/upload" className="btn-primary">
              <UploadCloud className="h-4 w-4" />
              Upload
            </Link>
          </div>
        }
      />

      {isError && <ErrorNote message={error.message} />}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-edge p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "bg-brand-500/15 text-brand-700 ring-1 ring-inset ring-brand-500/30 dark:text-brand-200"
                    : "text-ink-muted hover:bg-panel2 hover:text-ink"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    tab === t.key ? "bg-brand-500/20 text-brand-700 dark:text-brand-200" : "bg-panel2 text-ink-faint"
                  }`}
                >
                  {counts[t.key] || 0}
                </span>
              </button>
            ))}
          </div>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search vendor, invoice #, PO…"
              className="input pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-faint">
              <tr className="border-b border-edge">
                <th className="px-5 py-3 font-semibold">ID</th>
                <th className="px-5 py-3 font-semibold">Vendor</th>
                <th className="px-5 py-3 font-semibold">Invoice #</th>
                <th className="px-5 py-3 font-semibold">PO</th>
                <th className="px-5 py-3 font-semibold">Total</th>
                <th className="px-5 py-3 font-semibold">Anomaly</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/70">
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-5 py-3">
                      <div className="skeleton h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={FileStack}
                      title="No matching invoices"
                      hint="Try a different search or filter, or upload a new invoice."
                    />
                  </td>
                </tr>
              )}
              {rows.map((inv) => {
                const am = anomalyMeta(inv.anomaly_score, inv.is_anomaly);
                return (
                  <tr key={inv.id} className="transition-colors hover:bg-panel2/50">
                    <td className="px-5 py-3">
                      <Link to={`/invoices/${inv.id}`} className="font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300 dark:hover:text-brand-200">
                        #{inv.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ink-soft">{inv.vendor_name || "—"}</td>
                    <td className="px-5 py-3 text-ink-muted">{inv.invoice_number || "—"}</td>
                    <td className="px-5 py-3 text-ink-muted">{inv.po_number || "—"}</td>
                    <td className="px-5 py-3 font-medium text-ink-soft">{formatMoney(inv.total_amount)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${am.text}`}>
                        {formatScore(inv.anomaly_score)}
                        {inv.is_anomaly && (
                          <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-600 ring-1 ring-inset ring-rose-500/30 dark:text-rose-300">
                            anomaly
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-5 py-3 text-ink-faint">{formatDateShort(inv.uploaded_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
