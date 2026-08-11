import type { ReactNode } from "react";

// Shared shell for the SVG-based charts (TimeSeries, Histogram, DotPlot): padding math, grid/axis
// lines, and a title slot. BarList and Sparkline don't use this — BarList is DOM divs (labels
// reflow better that way) and Sparkline is deliberately axis-free.
//
// Convention shared by every chart in this directory: viewBox + width="100%" for responsiveness
// (no ResizeObserver needed), colors always via var(--chart-N)/currentColor (never hardcoded, so
// both themes work with zero `dark:` variants), and role="img" + <title> for a11y.
export const CHART_PADDING = { top: 12, right: 12, bottom: 24, left: 32 };

export function ChartFrame({
  title,
  width = 600,
  height = 220,
  padding = CHART_PADDING,
  showGrid = true,
  gridLines = 4,
  children,
}: {
  title: string;
  width?: number;
  height?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  showGrid?: boolean;
  gridLines?: number;
  children: (plot: { x0: number; y0: number; x1: number; y1: number; w: number; h: number }) => ReactNode;
}) {
  const x0 = padding.left;
  const y0 = padding.top;
  const x1 = width - padding.right;
  const y1 = height - padding.bottom;
  const w = x1 - x0;
  const h = y1 - y0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={title}
      className="block"
    >
      <title>{title}</title>
      {showGrid &&
        Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = y0 + (h * i) / gridLines;
          return (
            <line
              key={i}
              x1={x0}
              x2={x1}
              y1={y}
              y2={y}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      <line x1={x0} x2={x0} y1={y0} y2={y1} stroke="var(--chart-axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <line x1={x0} x2={x1} y1={y1} y2={y1} stroke="var(--chart-axis)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {children({ x0, y0, x1, y1, w, h })}
    </svg>
  );
}
