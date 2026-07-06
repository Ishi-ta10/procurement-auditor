import { useChartTheme } from "../../hooks/useChartTheme.js";

/**
 * Themed Recharts tooltip. Pass a `rows` renderer to control content, or rely on
 * the default which lists each series with its color swatch.
 */
export default function ChartTooltip({ active, payload, label, formatter, title }) {
  const t = useChartTheme();
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-elevated"
      style={{ background: t.tooltipBg, borderColor: t.tooltipBorder, color: t.tooltipText }}
    >
      {(title ? title(label, payload) : label) != null && (
        <div className="mb-1 font-semibold" style={{ color: t.tooltipText }}>
          {title ? title(label, payload) : label}
        </div>
      )}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5" style={{ color: t.axis }}>
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: p.color || p.fill || p.stroke }}
              />
              {p.name}
            </span>
            <span className="font-semibold" style={{ color: t.tooltipText }}>
              {formatter ? formatter(p.value, p) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
