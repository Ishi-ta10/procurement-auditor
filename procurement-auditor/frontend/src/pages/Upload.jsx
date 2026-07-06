import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, Loader2, UploadCloud } from "lucide-react";
import { useInvoiceStatus, useUploadInvoice } from "../hooks/useApi";
import {
  Card,
  PageHeader,
  StatusBadge,
  anomalyMeta,
  formatMoney,
  formatScore,
} from "../components/ui.jsx";

const DONE_STATUSES = ["approved", "escalated", "rejected"];
const AGENTS = ["Extractor", "Validator", "Anomaly", "Router"];

export default function Upload() {
  const [dragActive, setDragActive] = useState(false);
  const [invoiceId, setInvoiceId] = useState(null);
  const inputRef = useRef(null);

  const upload = useUploadInvoice();
  const polling = useInvoiceStatus(invoiceId, !!invoiceId);

  const status = polling.data?.status;
  const isProcessing =
    !!invoiceId && (!status || status === "pending" || status === "processing");
  const isDone = status && DONE_STATUSES.includes(status);

  const [result, setResult] = useState(null);
  if (isDone && !result && polling.data) {
    import("../api/client").then(({ api }) => {
      api.getInvoice(invoiceId).then(setResult).catch(() => {});
    });
  }

  const handleFile = useCallback(
    (file) => {
      if (!file) return;
      setResult(null);
      setInvoiceId(null);
      upload.mutate(file, { onSuccess: (data) => setInvoiceId(data.id) });
    },
    [upload]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragActive(false);
      handleFile(e.dataTransfer.files?.[0]);
    },
    [handleFile]
  );

  const am = anomalyMeta(polling.data?.anomaly_score, result?.is_anomaly);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Upload invoice"
        subtitle="Drop a PDF to run it through the multi-agent audit pipeline."
        icon={UploadCloud}
      />

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex h-60 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-all ${
          dragActive
            ? "border-brand-400 bg-brand-500/10 shadow-glow"
            : "border-edge2 bg-panel hover:border-brand-500/50 hover:bg-panel2/60"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
            dragActive ? "bg-brand-500/25 text-brand-600 dark:text-brand-200" : "bg-panel2 text-brand-600 dark:text-brand-300"
          }`}
        >
          <UploadCloud className="h-7 w-7" />
        </div>
        <div className="mt-4 text-sm font-medium text-ink-soft">Drag &amp; drop a PDF here</div>
        <div className="mt-1 text-xs text-ink-faint">or click to browse · PDF only</div>
        {upload.isPending && (
          <div className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-600 dark:text-brand-300">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
          </div>
        )}
        {upload.isError && <div className="mt-3 text-sm text-rose-600 dark:text-rose-400">{upload.error.message}</div>}
      </div>

      {/* Progress / result */}
      {invoiceId && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <FileText className="h-4 w-4 text-ink-faint" />
              Invoice{" "}
              <Link to={`/invoices/${invoiceId}`} className="font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300 dark:hover:text-brand-200">
                #{invoiceId}
              </Link>
            </div>
            {status && <StatusBadge status={status} />}
          </div>

          {/* Agent pipeline steps */}
          <div className="mt-5 flex items-center justify-between gap-2">
            {AGENTS.map((name, i) => (
              <div key={name} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isDone
                      ? "bg-emerald-500/20 text-emerald-600 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-300"
                      : isProcessing
                      ? "bg-brand-500/20 text-brand-600 ring-1 ring-inset ring-brand-500/30 dark:text-brand-300"
                      : "bg-panel2 text-ink-faint"
                  }`}
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
                </div>
                <span className="hidden text-xs text-ink-muted sm:block">{name}</span>
                {i < AGENTS.length - 1 && <div className="h-px flex-1 bg-edge" />}
              </div>
            ))}
          </div>

          {isProcessing && (
            <div className="mt-4 flex items-center gap-2 text-sm text-brand-600 dark:text-brand-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Agents are processing the invoice… ({status || "pending"})
            </div>
          )}

          {isDone && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-panel2 p-3.5 ring-1 ring-inset ring-edge">
                  <div className="text-[11px] uppercase tracking-wider text-ink-faint">Decision</div>
                  <div className="mt-1.5 capitalize text-ink">{status}</div>
                </div>
                <div className="rounded-xl bg-panel2 p-3.5 ring-1 ring-inset ring-edge">
                  <div className="text-[11px] uppercase tracking-wider text-ink-faint">Anomaly score</div>
                  <div className={`mt-1.5 font-medium ${am.text}`}>{formatScore(polling.data?.anomaly_score)}</div>
                </div>
                <div className="rounded-xl bg-panel2 p-3.5 ring-1 ring-inset ring-edge">
                  <div className="text-[11px] uppercase tracking-wider text-ink-faint">Total</div>
                  <div className="mt-1.5 text-ink">{formatMoney(result?.total_amount)}</div>
                </div>
              </div>

              {result?.line_items?.length > 0 && (
                <div>
                  <div className="mb-2 section-title">Extracted line items</div>
                  <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-edge">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-panel2 text-[11px] uppercase tracking-wider text-ink-faint">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Description</th>
                          <th className="px-4 py-2.5 font-semibold">Qty</th>
                          <th className="px-4 py-2.5 font-semibold">Unit price</th>
                          <th className="px-4 py-2.5 font-semibold">Line total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-edge/70">
                        {result.line_items.map((li) => (
                          <tr key={li.id}>
                            <td className="px-4 py-2.5 text-ink-soft">{li.description || "—"}</td>
                            <td className="px-4 py-2.5 text-ink-muted">{li.quantity ?? "—"}</td>
                            <td className="px-4 py-2.5 text-ink-muted">{formatMoney(li.unit_price)}</td>
                            <td className="px-4 py-2.5 text-ink-muted">{formatMoney(li.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <Link to={`/invoices/${invoiceId}`} className="btn-primary w-full sm:w-auto">
                View full audit trail <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
