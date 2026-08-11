import { ChartFrame } from "./ChartFrame";

// Fixed-bin vertical bar chart for a quantity (e.g. fit score distribution) — deliberately a
// SEQUENTIAL single-hue ramp (low value -> --chart-grid, high value -> --chart-1), not a rainbow
// categorical palette, since bins represent a single measured quantity, not distinct categories.
export function Histogram({
  title,
  bins,
  binLabels,
  width = 360,
  height = 220,
}: {
  title: string;
  bins: number[];
  /** One label per bin, e.g. "0-20", "20-40" — shown as an x-axis tick under every other bin. */
  binLabels: string[];
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...bins);

  return (
    <ChartFrame title={title} width={width} height={height} gridLines={4}>
      {({ x0, y1, w, h }) => {
        const n = bins.length;
        const gap = 4;
        const barWidth = n > 0 ? w / n - gap : 0;

        return (
          <>
            {bins.map((count, i) => {
              const barH = (count / max) * h;
              const x = x0 + i * (w / n) + gap / 2;
              const y = y1 - barH;
              // Sequential ramp: interpolate lightness/position between --chart-grid and --chart-1
              // by mixing them proportionally to this bin's share of the max value.
              const t = Math.round((count / max) * 100);
              const fill = `color-mix(in oklch, var(--chart-1) ${t}%, var(--chart-grid) ${100 - t}%)`;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={Math.max(0, barWidth)}
                    height={Math.max(0, barH)}
                    rx={2}
                    fill={fill}
                  >
                    <title>
                      {binLabels[i]}: {count}
                    </title>
                  </rect>
                  {i % 2 === 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={y1 + 14}
                      fontSize={9}
                      textAnchor="middle"
                      fill="var(--chart-axis)"
                    >
                      {binLabels[i]}
                    </text>
                  )}
                </g>
              );
            })}
            {bins.length === 0 && (
              <text x={x0 + w / 2} y={y1 - h / 2} fontSize={11} textAnchor="middle" fill="var(--chart-axis)">
                No data yet
              </text>
            )}
          </>
        );
      }}
    </ChartFrame>
  );
}
