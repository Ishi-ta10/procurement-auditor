import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FileStack,
  LayoutDashboard,
  Menu,
  Moon,
  ScrollText,
  ShieldCheck,
  Sun,
  UploadCloud,
  X,
} from "lucide-react";
import { useHealth } from "../hooks/useApi";
import { useTheme } from "../contexts/ThemeContext.jsx";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/invoices", label: "Invoices", icon: FileStack },
  { to: "/upload", label: "Upload", icon: UploadCloud },
  { to: "/purchase-orders", label: "Purchase Orders", icon: ScrollText },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-[0_6px_20px_-6px_rgba(99,102,241,0.9)]">
        <ShieldCheck className="h-5 w-5 text-white" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold text-ink">Procurement</div>
        <div className="text-[11px] font-medium text-brand-500 dark:text-brand-300">Auditor</div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              isActive
                ? "bg-brand-500/15 text-ink ring-1 ring-inset ring-brand-500/30"
                : "text-ink-muted hover:bg-panel2 hover:text-ink"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={`h-[18px] w-[18px] transition-colors ${
                  isActive ? "text-brand-500 dark:text-brand-300" : "text-ink-faint group-hover:text-ink-muted"
                }`}
              />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="btn-ghost h-9 w-9 p-0"
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

function HealthPill() {
  const { data, isError } = useHealth();
  const connected = !isError && data?.db === "connected";
  return (
    <div className="flex items-center gap-2 rounded-full border border-edge bg-panel2 px-3 py-1.5 text-xs">
      <span
        className={`h-2 w-2 rounded-full ${
          connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-rose-400"
        }`}
      />
      <span className={connected ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}>
        {connected ? "API online" : "API offline"}
      </span>
    </div>
  );
}

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-full">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-edge bg-panel/70 px-3 py-5 backdrop-blur-xl lg:flex">
        <Brand />
        <div className="mt-8 flex-1">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Navigation
          </div>
          <NavItems />
        </div>
        <div className="mt-auto rounded-xl border border-edge bg-panel2/60 p-3">
          <div className="text-[11px] font-semibold text-ink-soft">Multi-agent pipeline</div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
            Extractor → Validator → Anomaly → Router. Every invoice is audited automatically.
          </p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-edge bg-panel px-3 py-5">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                className="btn-ghost h-9 w-9 p-0"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-8">
              <NavItems onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-edge bg-surface/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost h-9 w-9 p-0 lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <span className="text-sm font-semibold text-ink-soft lg:hidden">
                Procurement Auditor
              </span>
            </div>
            <div className="flex items-center gap-2">
              <HealthPill />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
