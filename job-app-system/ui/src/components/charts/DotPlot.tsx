export interface DotPlotEntry {
  label: string;
  value: number;
}

// Lollipop/rail chart — the plan's explicit structural fix for avgResponseDaysByStage, which used
// to render in the same visual language as plain count charts (bars). A rail per row, a filled
// teal dot at the value, a connector from zero, and a REAL day axis (the count charts have no
// axis at all) so the axis's mere presence signals "this is a different unit (days), not a
// count." Deliberately its own component rather than a BarList variant for that reason.
export function DotPlot({
  title,
  entries,
  unit = "d",
  width = 360,
  height,
}: {
  title: string;
  entries: DotPlotEntry[];
  unit?: string;
  width?: number;
  height?: number;
}) {
  const padding = { top: 12, right: 20, bottom: 28, left: 100 };
  const rowHeight = 28;
  const h = height ?? padding.top + padding.bottom + Math.max(1, entries.length) * rowHeight;
  const maxValue = Math.max(1, ...entries.map((e) => e.value));
  // Round the axis max up to a "nice" tick step so labels read cleanly (0, 5, 10, 15...).
  const niceMax = Math.max(5, Math.ceil(maxValue / 5) * 5);
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (niceMax * i) / tickCount);

  const x0 = padding.left;
  const x1 = width - padding.right;
  const plotW = x1 - x0;
  const xAt = (v: number) => x0 + (v / niceMax) * plotW;

  return (
    <svg viewBox={`0 0 ${width} ${h}`} width="100%" role="img" aria-label={title} className="block">
      <title>{title}</title>
      {entries.map((entry, i) => {
        const y = padding.top + i * rowHeight + rowHeight / 2;
        const dotX = xAt(entry.value);
        return (
          <g key={entry.label}>
            <text x={0} y={y} dy={4} fontSize={11} fill="var(--muted-foreground)">
              {entry.label}
            </text>
            <line
              x1={x0}
              x2={x1}
              y1={y}
              y2={y}
              stroke="var(--chart-grid)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={x0}
              x2={dotX}
              y1={y}
              y2={y}
              stroke="var(--chart-3)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={dotX} cy={y} r={5} fill="var(--chart-3)">
              <title>
                {entry.label}: {entry.value.toFixed(1)}
                {unit}
              </title>
            </circle>
          </g>
        );
      })}
      {/* Real axis with tick labels — deliberately present here and absent from the count charts,
          so its presence alone signals "this is measured in days, not a count." */}
      <line
        x1={x0}
        x2={x1}
        y1={h - padding.bottom + 6}
        y2={h - padding.bottom + 6}
        stroke="var(--chart-axis)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={xAt(t)}
            x2={xAt(t)}
            y1={h - padding.bottom + 6}
            y2={h - padding.bottom + 10}
            stroke="var(--chart-axis)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text x={xAt(t)} y={h - padding.bottom + 22} fontSize={9} textAnchor="middle" fill="var(--chart-axis)">
            {Math.round(t)}
            {unit}
          </text>
        </g>
      ))}
      {entries.length === 0 && (
        <text x={width / 2} y={h / 2} fontSize={11} textAnchor="middle" fill="var(--chart-axis)">
          No data yet
        </text>
      )}
    </svg>
  );
}
