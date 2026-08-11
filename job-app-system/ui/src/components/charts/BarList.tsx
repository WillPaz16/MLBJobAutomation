// Horizontal category-bar list — replaces Analytics.tsx's old hand-rolled <Breakdown>. DOM divs
// rather than SVG: labels reflow naturally at narrow widths, no text-measurement needed.
export interface BarListEntry {
  label: string;
  value: number;
  color?: string; // defaults to var(--chart-1); pass e.g. "var(--chart-2)" for a per-series color
}

export function BarList({
  title,
  entries,
  max,
  emptyMessage = "No data yet",
}: {
  title?: string;
  entries: BarListEntry[];
  /** Override the bar scale's denominator so sibling charts can share one scale. */
  max?: number;
  emptyMessage?: string;
}) {
  const scale = Math.max(1, max ?? Math.max(0, ...entries.map((e) => e.value)));
  return (
    <div>
      {title && <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>}
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 truncate text-muted-foreground" title={entry.label}>
              {entry.label}
            </span>
            <div className="h-2.5 flex-1 rounded-full bg-muted">
              <div
                className="h-2.5 rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.min(100, (entry.value / scale) * 100)}%`,
                  backgroundColor: entry.color ?? "var(--chart-1)",
                }}
              />
            </div>
            <span className="w-8 shrink-0 text-right tabular text-foreground">{entry.value}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
      </div>
    </div>
  );
}
