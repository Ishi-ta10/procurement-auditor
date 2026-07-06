import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Coins,
  Download,
  FileStack,
  Filter,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  ScatterChart as ScatterIcon,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useDashboardSummary, useInvoices, useRetrainModel } from "../hooks/useApi";
import { PALETTE, RISK_SCALE, STATUS_COLORS, useChartTheme } from "../hooks/useChartTheme.js";
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  StatusBadge,
  anomalyMeta,
  formatDateShort,
  formatMoney,
  formatScore,
} from "../components/ui.jsx";
import KpiCard from "../components/KpiCard.jsx";
import Segmented from "../components/Segmented.jsx";
import ChartCard from "../components/charts/ChartCard.jsx";
import ChartTooltip from "../components/charts/ChartTooltip.jsx";
import { exportCsv } from "../lib/csv.js";
import {
  filterByRange,
  funnel,
  pctDelta,
  riskScatter,
  sparkFrom,
  splitPeriods,
  statusCounts,
  sumSpend,
  timeSeries,
  topVendors,
} from "../lib/analytics.js";

const RANGES = [
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
  { label: "All", value: null },
];

function compactMoney(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

export default function Dashboard() {
  const summary = useDashboardSummary();
  const invoices = useInvoices();
  const retrain = useRetrainModel();
  const chart = useChartTheme();

  const [range, setRange] = useState(90);
  const loading = invoices.isLoading || summary.isLoading;
  const all = invoices.data ?? [];

  const a = useMemo(() => {
    const scoped = filterByRange(all, range);
    const { current, previous } = splitPeriods(all, range);
    const base = current.length ? current : scoped;

    const spendNow = sumSpend(base);
    const spendPrev = sumSpend(previous);
    const flaggedNow = base.filter((i) => i.is_anomaly || Number(i.anomaly_score) >= 0.5).length;
    const flaggedPrev = previous.filter((i) => i.is_anomaly || Number(i.anomaly_score) >= 0.5).length;
    const apprNow = base.filter((i) => i.status === "approved").length;
    const apprPrev = previous.filter((i) => i.status === "approved").length;
    const baseN = base.length || 1;
    const prevN = previous.length || 1;

    return {
      scoped,
      series: timeSeries(scoped, range || 90),
      countNow: base.length,
      countDelta: pctDelta(current.length, previous.length),
      spendNow,
      spendDelta: pctDelta(spendNow, spendPrev),
      flaggedNow,
      flaggedDelta: pctDelta(flaggedNow, flaggedPrev),
      apprPct: (apprNow / baseN) * 100,
      apprDelta: pctDelta((apprNow / baseN) * 100, (apprPrev / prevN) * 100),
      vendors: topVendors(scoped, 6),
      funnelData: funnel(scoped),
      scatter: riskScatter(scoped),
      statuses: statusCounts(scoped),
    };
  }, [all, range]);

  const statusPie = useMemo(
    () =>
      ["approved", "escalated", "rejected", "pending", "processing"]
        .map((k) => ({ name: k, value: a.statuses[k] || 0, fill: STATUS_COLORS[k] }))
        .filter((d) => d.value > 0),
    [a.statuses]
  );
  const totalScoped = a.scoped.length;
  const anomalyDist = summary.data?.anomaly_score_distribution ?? [];
  const recent = all.slice(0, 6);

  const handleExport = () =>
    exportCsv(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, a.scoped, [
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
        title="Analytics Overview"
        subtitle="Real-time procurement intelligence across the multi-agent audit pipeline."
        icon={LayoutDashboard}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented options={RANGES} value={range} onChange={setRange} size="sm" />
            <button onClick={handleExport} className="btn-secondary" disabled={loading || totalScoped === 0}>
              <Download className="h-4 w-4" /> Export
            </button>
            <button onClick={() => retrain.mutate()} disabled={retrain.isPending} className="btn-secondary">
              <RefreshCw className={`h-4 w-4 ${retrain.isPending ? "animate-spin" : ""}`} />
              {retrain.isPending ? "Retraining…" : "Retrain"}
            </button>
          </div>
        }
      />

      {retrain.isSuccess && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
          Model retrained on {retrain.data?.samples} historical invoices.
        </div>
      )}
      {(summary.isError || invoices.isError) && (
        <ErrorNote message={(summary.error || invoices.error)?.message || "Failed to load analytics."} />
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Invoices"
          value={a.countNow}
          icon={FileStack}
          tone="brand"
          delta={range ? a.countDelta : null}
          spark={sparkFrom(a.series, "count")}
          loading={loading}
          hint="Total invoices processed in the selected period."
        />
        <KpiCard
          label="Total spend"
          value={a.spendNow}
          formatter={(v) => compactMoney(v)}
          icon={Coins}
          tone="violet"
          delta={range ? a.spendDelta : null}
          spark={sparkFrom(a.series, "spend")}
          loading={loading}
          hint="Sum of invoice totals in the selected period."
        />
        <KpiCard
          label="Auto-approval rate"
          value={a.apprPct}
          formatter={(v) => `${v.toFixed(1)}%`}
          icon={CheckCircle2}
          tone="emerald"
          delta={range ? a.apprDelta : null}
          loading={loading}
          hint="Share approved automatically without human review."
        />
        <KpiCard
          label="Anomalies flagged"
          value={a.flaggedNow}
          icon={ShieldAlert}
          tone="rose"
          delta={range ? a.flaggedDelta : null}
          invert
          spark={sparkFrom(a.series, "flagged")}
          loading={loading}
          hint="Invoices flagged by the IsolationForest model or validation rules."
        />
      </div>

      {/* Volume & spend + status donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Invoice volume & spend"
          subtitle="Daily processed invoices and total spend"
          icon={Activity}
          loading={loading}
          isEmpty={!loading && a.series.every((d) => d.count === 0)}
          emptyIcon={Activity}
          emptyTitle="No activity in this period"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={a.series} margin={{ top: 6, right: 6, left: -6, bottom: 0 }}>
              <defs>
                <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE.brand} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={PALETTE.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis dataKey="label" stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis yAxisId="left" stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactMoney} />
              <YAxis yAxisId="right" orientation="right" stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: chart.grid }}
                content={<ChartTooltip formatter={(val, p) => (p.dataKey === "spend" ? compactMoney(val) : val)} />}
              />
              <Area yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke={PALETTE.brand} strokeWidth={2} fill="url(#spendFill)" animationDuration={800} />
              <Line yAxisId="right" type="monotone" dataKey="count" name="Invoices" stroke={PALETTE.sky} strokeWidth={2} dot={false} animationDuration={800} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Status distribution"
          subtitle="Outcomes in this period"
          icon={Gauge}
          loading={loading}
          isEmpty={!loading && statusPie.length === 0}
          emptyIcon={Gauge}
          emptyTitle="No invoices yet"
        >
          <div className="relative h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="86%" paddingAngle={2} stroke="none" animationDuration={800}>
                  {statusPie.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip title={(l, p) => p?.[0]?.name} formatter={(v) => `${v} invoices`} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-ink">{totalScoped}</span>
              <span className="text-xs text-ink-muted">invoices</span>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Top vendors + anomaly distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top vendors by spend"
          subtitle="Highest total invoiced amount"
          icon={Users}
          loading={loading}
          isEmpty={!loading && a.vendors.length === 0}
          emptyIcon={Users}
          emptyTitle="No vendor data"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={a.vendors} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
              <XAxis type="number" stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactMoney} />
              <YAxis type="category" dataKey="vendor" stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} width={110} />
              <Tooltip cursor={{ fill: chart.cursor }} content={<ChartTooltip formatter={(v) => compactMoney(v)} />} />
              <Bar dataKey="spend" name="Spend" radius={[0, 6, 6, 0]} fill={PALETTE.brand} maxBarSize={22} animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Anomaly score distribution"
          subtitle="Risk spread across scored invoices"
          icon={BarChart3}
          loading={loading}
          isEmpty={!loading && anomalyDist.length === 0}
          emptyIcon={BarChart3}
          emptyTitle="No scored invoices"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={anomalyDist} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis dataKey="label" stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: chart.cursor }} content={<ChartTooltip formatter={(v) => `${v} invoices`} />} />
              <Bar dataKey="count" name="Invoices" radius={[6, 6, 0, 0]} animationDuration={800}>
                {anomalyDist.map((_, i) => (
                  <Cell key={i} fill={RISK_SCALE[i % RISK_SCALE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Funnel + risk scatter */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Processing funnel"
          subtitle="Uploaded → processed → approved"
          icon={Filter}
          loading={loading}
          isEmpty={!loading && totalScoped === 0}
          emptyIcon={Filter}
          emptyTitle="No invoices yet"
        >
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip content={<ChartTooltip title={(l, p) => p?.[0]?.payload?.name} formatter={(v) => `${v} invoices`} />} />
              <Funnel dataKey="value" data={a.funnelData} isAnimationActive animationDuration={800}>
                <LabelList position="right" fill={chart.dark ? "#cbd5e1" : "#334155"} stroke="none" dataKey="name" fontSize={12} />
                <LabelList position="center" fill="#ffffff" stroke="none" dataKey="value" fontSize={13} fontWeight={700} />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Risk map"
          subtitle="Anomaly score vs invoice amount"
          icon={ScatterIcon}
          loading={loading}
          isEmpty={!loading && a.scatter.length === 0}
          emptyIcon={ScatterIcon}
          emptyTitle="No scored invoices"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
              <XAxis type="number" dataKey="x" name="Amount" stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} tickFormatter={compactMoney} />
              <YAxis type="number" dataKey="y" name="Anomaly" domain={[0, 1]} stroke={chart.axis} fontSize={11} tickLine={false} axisLine={false} />
              <ZAxis range={[45, 45]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: chart.grid }}
                content={<ChartTooltip title={(l, p) => p?.[0]?.payload?.vendor} formatter={(v, p) => (p.dataKey === "x" ? compactMoney(v) : Number(v).toFixed(3))} />}
              />
              <Scatter data={a.scatter} animationDuration={700}>
                {a.scatter.map((d, i) => (
                  <Cell key={i} fill={STATUS_COLORS[d.status] || PALETTE.slate} fillOpacity={0.75} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Recent invoices */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Recent invoices</h2>
          <Link to="/invoices" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300 dark:hover:text-brand-200">
            View all <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-faint">
              <tr className="border-b border-edge">
                <th className="px-5 py-3 font-semibold">ID</th>
                <th className="px-5 py-3 font-semibold">Vendor</th>
                <th className="px-5 py-3 font-semibold">Total</th>
                <th className="px-5 py-3 font-semibold">Anomaly</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/70">
              {loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-3">
                      <div className="skeleton h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading && recent.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={FileStack} title="No invoices yet" hint="Upload a PDF to get started." />
                  </td>
                </tr>
              )}
              {!loading &&
                recent.map((inv) => {
                  const am = anomalyMeta(inv.anomaly_score, inv.is_anomaly);
                  return (
                    <tr key={inv.id} className="transition-colors hover:bg-panel2/50">
                      <td className="px-5 py-3">
                        <Link to={`/invoices/${inv.id}`} className="font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300 dark:hover:text-brand-200">
                          #{inv.id}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ink-soft">{inv.vendor_name || "—"}</td>
                      <td className="px-5 py-3 text-ink-soft">{formatMoney(inv.total_amount)}</td>
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
      </div>
    </div>
  );
}
