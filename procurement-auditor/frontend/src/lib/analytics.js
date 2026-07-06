// Pure helpers that derive enterprise analytics series from the raw invoice list.
// Kept framework-free and memo-friendly so charts stay fast and predictable.

const DAY = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Business date for an invoice — prefer the invoice date, fall back to upload time. */
function invDate(inv) {
  return toDate(inv.invoice_date) || toDate(inv.uploaded_at);
}

/** Filter invoices to those within the last `days` (null = all time). */
export function filterByRange(invoices, days) {
  if (!days) return invoices;
  const cutoff = Date.now() - days * DAY;
  return invoices.filter((inv) => {
    const d = invDate(inv);
    return d && d.getTime() >= cutoff;
  });
}

/** Split a range into two equal halves for period-over-period comparison. */
export function splitPeriods(invoices, days) {
  if (!days) return { current: invoices, previous: [] };
  const now = Date.now();
  const currentStart = now - days * DAY;
  const prevStart = now - 2 * days * DAY;
  const current = [];
  const previous = [];
  for (const inv of invoices) {
    const d = invDate(inv);
    if (!d) continue;
    const t = d.getTime();
    if (t >= currentStart) current.push(inv);
    else if (t >= prevStart) previous.push(inv);
  }
  return { current, previous };
}

const num = (v) => (v == null ? 0 : Number(v) || 0);

export function sumSpend(invoices) {
  return invoices.reduce((acc, i) => acc + num(i.total_amount), 0);
}

export function pctDelta(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/** Daily buckets of invoice volume + spend for the given window. */
export function timeSeries(invoices, days) {
  const span = days || 30;
  const buckets = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, count: 0, spend: 0, flagged: 0 });
  }
  for (const inv of invoices) {
    const d = invDate(inv);
    if (!d) continue;
    const key = d.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    b.count += 1;
    b.spend += num(inv.total_amount);
    if (inv.is_anomaly || num(inv.anomaly_score) >= 0.5) b.flagged += 1;
  }
  return Array.from(buckets.values()).map((b) => ({
    ...b,
    label: new Date(b.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    spend: Math.round(b.spend),
  }));
}

/** Sparkline series (just the counts) from a time series. */
export function sparkFrom(series, key = "count") {
  return series.map((d, i) => ({ i, v: d[key] }));
}

/** Top vendors by total spend, with flag counts. */
export function topVendors(invoices, limit = 6) {
  const map = new Map();
  for (const inv of invoices) {
    const v = inv.vendor_name || "Unknown";
    const cur = map.get(v) || { vendor: v, spend: 0, count: 0, flagged: 0 };
    cur.spend += num(inv.total_amount);
    cur.count += 1;
    if (inv.is_anomaly || num(inv.anomaly_score) >= 0.5) cur.flagged += 1;
    map.set(v, cur);
  }
  return Array.from(map.values())
    .map((d) => ({ ...d, spend: Math.round(d.spend) }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}

/** Processing funnel: uploaded → processed → auto-approved. */
export function funnel(invoices) {
  const total = invoices.length;
  const processed = invoices.filter((i) => i.status !== "pending" && i.status !== "processing").length;
  const cleared = invoices.filter((i) => i.status === "approved" || i.status === "escalated").length;
  const approved = invoices.filter((i) => i.status === "approved").length;
  return [
    { name: "Uploaded", value: total, fill: "#6366f1" },
    { name: "Processed", value: processed, fill: "#38bdf8" },
    { name: "Passed / Reviewed", value: cleared, fill: "#8b5cf6" },
    { name: "Approved", value: approved, fill: "#10b981" },
  ];
}

/** Risk scatter: anomaly score vs invoice amount. */
export function riskScatter(invoices, limit = 120) {
  return invoices
    .filter((i) => i.anomaly_score != null && i.total_amount != null)
    .slice(0, limit)
    .map((i) => ({
      x: num(i.total_amount),
      y: Number(i.anomaly_score),
      status: i.status,
      id: i.id,
      vendor: i.vendor_name || "Unknown",
    }));
}

export function statusCounts(invoices) {
  const c = {};
  for (const i of invoices) c[i.status] = (c[i.status] || 0) + 1;
  return c;
}
