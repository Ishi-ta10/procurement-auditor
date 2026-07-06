// Minimal CSV export helper — no dependency, handles quoting/escaping.
export function exportCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) return;
  const cols = columns || Object.keys(rows[0]).map((key) => ({ key, label: key }));
  const escape = (val) => {
    if (val == null) return "";
    const s = String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((row) => cols.map((c) => escape(typeof c.get === "function" ? c.get(row) : row[c.key])).join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
