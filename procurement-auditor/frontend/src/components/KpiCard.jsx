import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { useCountUp } from "../hooks/useCountUp.js";
import Sparkline from "./Sparkline.jsx";

const TONES = {
  brand: "bg-brand-500/15 text-brand-600 dark:text-brand-300 ring-brand-500/25",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-amber-500/25",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-300 ring-rose-500/25",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-300 ring-violet-500/25",
};

const SPARK_COLORS = {
  brand: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  violet: "#8b5cf6",
};

function Trend({ delta, invert = false }) {
  if (delta == null || !isFinite(delta)) return null;
  const flat = Math.abs(delta) < 0.05;
  // For "good-up" metrics higher is positive; for invert metrics (e.g. risk) lower is positive.
  const positive = invert ? delta < 0 : delta > 0;
  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const color = flat
    ? "text-ink-muted"
    : positive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

/**
 * Animated KPI card with icon, count-up value, period-over-period trend,
 * a mini sparkline, and an optional tooltip explaining the metric.
 */
export default function KpiCard({
  label,
  value,
  formatter = (v) => Math.round(v).toLocaleString(),
  icon: Icon,
  tone = "brand",
  delta,
  invert = false,
  spark,
  hint,
  loading = false,
}) {
  const animated = useCountUp(loading ? 0 : Number(value) || 0);

  if (loading) {
    return (
      <div className="card p-5">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton mt-3 h-8 w-28" />
        <div className="skeleton mt-4 h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="card card-hover group p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-ink-muted">{label}</span>
          {hint && (
            <span className="group/tip relative inline-flex">
              <Info className="h-3.5 w-3.5 cursor-help text-ink-faint" />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 rounded-lg border border-edge bg-panel px-3 py-2 text-xs text-ink-soft opacity-0 shadow-elevated transition-opacity group-hover/tip:opacity-100">
                {hint}
              </span>
            </span>
          )}
        </div>
        {Icon && (
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ${TONES[tone]}`}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <span className="text-3xl font-bold tracking-tight text-ink">{formatter(animated)}</span>
        <span className="pb-1">
          <Trend delta={delta} invert={invert} />
        </span>
      </div>

      {spark && spark.length > 0 && (
        <div className="mt-3 -mx-1">
          <Sparkline data={spark} color={SPARK_COLORS[tone]} height={40} />
        </div>
      )}
    </div>
  );
}
