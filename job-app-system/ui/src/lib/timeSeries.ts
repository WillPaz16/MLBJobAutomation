// Pure date-bucketing helpers, no date library — mirrors the project's existing no-date-lib
// convention (Pipeline's hand-rolled `relativeTime()`). Everything here operates in UTC ms so
// results are deterministic regardless of the host's local timezone.

const DAY_MS = 24 * 60 * 60 * 1000;

// UTC Monday 00:00:00 of the week containing `d`, as epoch ms.
export function startOfWeek(d: Date): number {
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(utcMidnight).getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dow + 6) % 7; // Monday -> 0, Sunday -> 6
  return utcMidnight - daysSinceMonday * DAY_MS;
}

// UTC midnight of the day containing `d`, as epoch ms.
export function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Buckets `dates` into `weeks` consecutive weekly buckets ending at (and including) the current
// week. Always zero-fills every bucket in the window — a week with no matching dates still
// appears as {t, v: 0} rather than being silently absent, since an absent point would make a
// trend line lie about a quiet week.
export function bucketByWeek(dates: (string | null | undefined)[], weeks: number): { t: number; v: number }[] {
  const now = new Date();
  const currentWeekStart = startOfWeek(now);
  const buckets: { t: number; v: number }[] = [];
  const indexByStart = new Map<number, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const t = currentWeekStart - i * 7 * DAY_MS;
    indexByStart.set(t, buckets.length);
    buckets.push({ t, v: 0 });
  }
  const earliest = buckets[0].t;
  for (const raw of dates) {
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const wk = startOfWeek(d);
    if (wk < earliest || wk > currentWeekStart) continue;
    const idx = indexByStart.get(wk);
    if (idx !== undefined) buckets[idx].v += 1;
  }
  return buckets;
}

// Same zero-filling contract as bucketByWeek, but by day.
export function bucketByDay(dates: (string | null | undefined)[], days: number): { t: number; v: number }[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const buckets: { t: number; v: number }[] = [];
  const indexByStart = new Map<number, number>();
  for (let i = days - 1; i >= 0; i--) {
    const t = todayStart - i * DAY_MS;
    indexByStart.set(t, buckets.length);
    buckets.push({ t, v: 0 });
  }
  const earliest = buckets[0].t;
  for (const raw of dates) {
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const day = startOfDay(d);
    if (day < earliest || day > todayStart) continue;
    const idx = indexByStart.get(day);
    if (idx !== undefined) buckets[idx].v += 1;
  }
  return buckets;
}

// Fixed-bin histogram over `domain` (inclusive lower, inclusive upper). Values outside the
// domain are clamped into the nearest edge bin rather than dropped, so nothing silently vanishes.
export function histogram(values: number[], bins: number, domain: [number, number]): number[] {
  const [lo, hi] = domain;
  const counts = new Array(bins).fill(0) as number[];
  if (bins <= 0) return counts;
  const span = hi - lo;
  for (const v of values) {
    if (v == null || Number.isNaN(v)) continue;
    let idx: number;
    if (span <= 0) {
      idx = 0;
    } else {
      idx = Math.floor(((v - lo) / span) * bins);
      if (idx < 0) idx = 0;
      if (idx >= bins) idx = bins - 1;
    }
    counts[idx] += 1;
  }
  return counts;
}
