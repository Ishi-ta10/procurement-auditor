import { EmptyState, Spinner } from "../ui.jsx";

/**
 * Standard chart container: header (title + optional subtitle/actions),
 * consistent padding, and built-in loading / empty states.
 */
export default function ChartCard({
  title,
  subtitle,
  icon: Icon,
  actions,
  loading = false,
  isEmpty = false,
  emptyIcon,
  emptyTitle = "No data",
  emptyHint,
  height = 288,
  className = "",
  children,
}) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-brand-500 dark:text-brand-300" />}
          <div>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </div>

      <div style={{ height }} className="w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState icon={emptyIcon} title={emptyTitle} hint={emptyHint} />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
