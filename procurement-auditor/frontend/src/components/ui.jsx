// Shared enterprise UI primitives: status/severity theming, formatting, and
// small presentational components used across every page.
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldAlert, XCircle } from "lucide-react";

/* ------------------------------------------------------------------ status */

export const STATUS_META = {
  approved: {
    label: "Approved",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/30",
    dot: "bg-emerald-400",
    row: "hover:bg-emerald-500/[0.05]",
    accent: "text-emerald-600 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  escalated: {
    label: "Escalated",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/30",
    dot: "bg-amber-400",
    row: "hover:bg-amber-500/[0.05]",
    accent: "text-amber-600 dark:text-amber-300",
    Icon: AlertTriangle,
  },
  rejected: {
    label: "Rejected",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-500/30",
    dot: "bg-rose-400",
    row: "hover:bg-rose-500/[0.05]",
    accent: "text-rose-600 dark:text-rose-300",
    Icon: XCircle,
  },
  pending: {
    label: "Pending",
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-500/30",
    dot: "bg-sky-400",
    row: "hover:bg-sky-500/[0.05]",
    accent: "text-sky-600 dark:text-sky-300",
    Icon: Clock,
  },
  processing: {
    label: "Processing",
    badge: "bg-brand-500/15 text-brand-600 dark:text-brand-300 ring-1 ring-inset ring-brand-500/30",
    dot: "bg-brand-400 animate-pulse",
    row: "hover:bg-brand-500/[0.05]",
    accent: "text-brand-600 dark:text-brand-300",
    Icon: Loader2,
  },
};

export function statusMeta(status) {
  return (
    STATUS_META[status] || {
      label: status || "Unknown",
      badge: "bg-gray-500/15 text-ink-soft ring-1 ring-inset ring-gray-500/30",
      dot: "bg-gray-400",
      row: "",
      accent: "text-ink-soft",
      Icon: ShieldAlert,
    }
  );
}

export function StatusBadge({ status, withIcon = true }) {
  const m = statusMeta(status);
  const Icon = m.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${m.badge}`}
    >
      {withIcon && <Icon className="h-3.5 w-3.5" />}
      {m.label}
    </span>
  );
}

export const SEVERITY_META = {
  info: {
    dot: "bg-sky-400",
    ring: "ring-sky-500/40",
    text: "text-sky-600 dark:text-sky-300",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-500/25",
  },
  warning: {
    dot: "bg-amber-400",
    ring: "ring-amber-500/40",
    text: "text-amber-600 dark:text-amber-300",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/25",
  },
  critical: {
    dot: "bg-rose-400",
    ring: "ring-rose-500/40",
    text: "text-rose-600 dark:text-rose-300",
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-500/25",
  },
};

export function severityMeta(sev) {
  return SEVERITY_META[sev] || SEVERITY_META.info;
}

/* -------------------------------------------------------------- components */

export function Card({ className = "", hover = false, children }) {
  return <div className={`card ${hover ? "card-hover" : ""} ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, icon: Icon, actions }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/25">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className = "h-5 w-5" }) {
  return <Loader2 className={`animate-spin text-brand-400 ${className}`} />;
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-panel2 text-ink-faint ring-1 ring-inset ring-edge">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="text-sm font-medium text-ink-soft">{title}</div>
      {hint && <div className="max-w-sm text-xs text-ink-faint">{hint}</div>}
    </div>
  );
}

export function ErrorNote({ message }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Anomaly severity → colour + label. Higher score = more anomalous.
 */
export function anomalyMeta(score, isAnomaly) {
  if (score === null || score === undefined) {
    return { label: "n/a", text: "text-ink-muted", bar: "bg-gray-400", ring: "ring-gray-500/30" };
  }
  const s = Number(score);
  if (isAnomaly || s >= 0.9)
    return { label: "Severe", text: "text-rose-600 dark:text-rose-300", bar: "bg-rose-500", ring: "ring-rose-500/30" };
  if (s >= 0.5)
    return { label: "Elevated", text: "text-amber-600 dark:text-amber-300", bar: "bg-amber-500", ring: "ring-amber-500/30" };
  return { label: "Normal", text: "text-emerald-600 dark:text-emerald-300", bar: "bg-emerald-500", ring: "ring-emerald-500/30" };
}

export function AnomalyBar({ score, isAnomaly }) {
  const m = anomalyMeta(score, isAnomaly);
  const pct = Math.min(100, Math.max(0, Number(score || 0) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-panel2 ring-1 ring-inset ring-edge">
      <div className={`h-full rounded-full ${m.bar} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* --------------------------------------------------------------- formatters */

export function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateShort(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatScore(value) {
  if (value === null || value === undefined) return "—";
  return Number(value).toFixed(4);
}
