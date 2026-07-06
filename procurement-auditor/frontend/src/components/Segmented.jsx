/** Compact segmented control (e.g. date-range selector). */
export default function Segmented({ options, value, onChange, size = "md" }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-edge bg-panel2 p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={`rounded-md font-medium transition-colors ${pad} ${
              active
                ? "bg-panel text-ink shadow-card ring-1 ring-inset ring-edge"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
