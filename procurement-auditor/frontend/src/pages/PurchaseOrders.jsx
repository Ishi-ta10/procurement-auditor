import { useMemo, useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { usePurchaseOrders } from "../hooks/useApi";
import {
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  formatDateShort,
  formatMoney,
} from "../components/ui.jsx";

export default function PurchaseOrders() {
  const { data, isLoading, isError, error } = usePurchaseOrders();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((po) =>
      [po.po_number, po.vendor_name, po.item_description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [data, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        subtitle="Reference catalogue the validator checks invoices against."
        icon={ScrollText}
      />

      {isError && <ErrorNote message={error.message} />}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-edge p-4">
          <span className="text-sm font-semibold text-ink-soft">
            {rows.length} purchase order{rows.length === 1 ? "" : "s"}
          </span>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search PO #, vendor, item…"
              className="input pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ink-faint">
              <tr className="border-b border-edge">
                <th className="px-5 py-3 font-semibold">PO #</th>
                <th className="px-5 py-3 font-semibold">Vendor</th>
                <th className="px-5 py-3 font-semibold">Item</th>
                <th className="px-5 py-3 font-semibold">Unit price</th>
                <th className="px-5 py-3 font-semibold">Qty</th>
                <th className="px-5 py-3 font-semibold">Total</th>
                <th className="px-5 py-3 font-semibold">Order date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/70">
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-3">
                      <div className="skeleton h-5 w-full" />
                    </td>
                  </tr>
                ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={ScrollText}
                      title="No purchase orders"
                      hint="Seed the purchase_orders table to populate this list."
                    />
                  </td>
                </tr>
              )}
              {rows.map((po) => (
                <tr key={po.id} className="transition-colors hover:bg-panel2/50">
                  <td className="px-5 py-3 font-medium text-brand-600 dark:text-brand-300">{po.po_number}</td>
                  <td className="px-5 py-3 text-ink-soft">{po.vendor_name}</td>
                  <td className="px-5 py-3 text-ink-muted">{po.item_description}</td>
                  <td className="px-5 py-3 text-ink-soft">{formatMoney(po.unit_price)}</td>
                  <td className="px-5 py-3 text-ink-muted">{po.quantity}</td>
                  <td className="px-5 py-3 font-medium text-ink-soft">{formatMoney(po.total_amount)}</td>
                  <td className="px-5 py-3 text-ink-faint">{formatDateShort(po.order_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
