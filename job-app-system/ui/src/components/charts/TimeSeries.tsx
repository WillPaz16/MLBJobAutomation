import { ChartFrame } from "./ChartFrame";

export interface TimeSeriesSeries {
  label: string;
  color: string; // e.g. "var(--chart-1)"
  values: number[]; // must be the same length as `labels`
}

// Area+line chart over evenly-spaced buckets (weekly, in the current usage). The area fill is an
// SVG linearGradient from `color` at low opacity down to transparent; the stroke uses
// vector-effect="non-scaling-stroke" so a responsive viewBox never fattens the line.
export function TimeSeries({
  title,
  labels,
  series,
  width = 720,
  height = 240,
}: {
  title: string;
  labels: string[];
  series: TimeSeriesSeries[];
  width?: number;
  height?: number;
}) {
  const n = labels.length;
  const maxValue = Math.max(1, ...series.flatMap((s) => s.values));

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <ChartFrame title={title} width={width} height={height} gridLines={4}>
        {({ x0, y1, w, h }) => {
        const xAt = (i: number) => x0 + (n <= 1 ? 0 : (w * i) / (n - 1));
        const yAt = (v: number) => y1 - (v / maxValue) * h;

        return (
          <>
            <defs>
              {series.map((s, si) => (
                <linearGradient key={si} id={`ts-grad-${si}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {series.map((s, si) => {
              const points = s.values.map((v, i) => [xAt(i), yAt(v)] as const);
              const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
              const areaPath = `${linePath} L${points[points.length - 1]?.[0] ?? x0},${y1} L${points[0]?.[0] ?? x0},${y1} Z`;
              return (
                <g key={s.label}>
                  <path d={areaPath} fill={`url(#ts-grad-${si})`} stroke="none" />
                  <path
                    d={linePath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                  {points.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r={2.5} fill={s.color}>
                      <title>
                        {s.label} · {labels[i]}: {s.values[i]}
                      </title>
                    </circle>
                  ))}
                </g>
              );
            })}
          </>
          );
        }}
      </ChartFrame>
    </div>
  );
}
