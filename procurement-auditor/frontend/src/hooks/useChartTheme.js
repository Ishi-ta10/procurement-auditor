import { useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext.jsx";

// Shared, WCAG-conscious palette used across every chart for consistency.
export const PALETTE = {
  brand: "#6366f1", // neutral KPIs / primary
  emerald: "#10b981", // positive / approved
  amber: "#f59e0b", // warning / escalated
  rose: "#f43f5e", // risk / rejected
  sky: "#38bdf8", // informational
  violet: "#8b5cf6", // AI / predictive
  slate: "#94a3b8",
};

// Ordered series for anomaly buckets (low → high risk).
export const RISK_SCALE = ["#10b981", "#84cc16", "#f59e0b", "#fb923c", "#f43f5e"];

export const STATUS_COLORS = {
  approved: PALETTE.emerald,
  escalated: PALETTE.amber,
  rejected: PALETTE.rose,
  pending: PALETTE.sky,
  processing: PALETTE.brand,
};

export function useChartTheme() {
  const { theme } = useTheme();
  return useMemo(() => {
    const dark = theme === "dark";
    return {
      dark,
      grid: dark ? "#242a37" : "#e2e8f0",
      axis: dark ? "#6b7280" : "#94a3b8",
      tooltipBg: dark ? "#11141c" : "#ffffff",
      tooltipBorder: dark ? "#2f3646" : "#e2e8f0",
      tooltipText: dark ? "#e5e7eb" : "#0f172a",
      cursor: dark ? "rgba(99,102,241,0.10)" : "rgba(99,102,241,0.08)",
    };
  }, [theme]);
}
