import { describe, expect, it } from "vitest";
import { bucketByDay, bucketByWeek, histogram, startOfWeek } from "@/lib/timeSeries";

describe("startOfWeek", () => {
  it("returns the UTC Monday for a mid-week date", () => {
    // 2026-08-13 is a Thursday
    const t = startOfWeek(new Date("2026-08-13T15:30:00Z"));
    expect(new Date(t).toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("returns the same Monday when given that Monday", () => {
    const t = startOfWeek(new Date("2026-08-10T00:00:00Z"));
    expect(new Date(t).toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("handles Sunday correctly (rolls back to the prior Monday)", () => {
    const t = startOfWeek(new Date("2026-08-16T23:59:00Z"));
    expect(new Date(t).toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });
});

describe("bucketByWeek", () => {
  it("zero-fills every bucket across the requested window", () => {
    const buckets = bucketByWeek([], 5);
    expect(buckets).toHaveLength(5);
    expect(buckets.every((b) => b.v === 0)).toBe(true);
  });

  it("returns buckets in ascending chronological order ending at the current week", () => {
    const buckets = bucketByWeek([], 4);
    const currentWeek = startOfWeek(new Date());
    expect(buckets[buckets.length - 1].t).toBe(currentWeek);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].t).toBeGreaterThan(buckets[i - 1].t);
    }
  });

  it("counts dates into the correct week and ignores null/invalid entries", () => {
    const now = new Date();
    const thisWeek = new Date(startOfWeek(now)).toISOString();
    const buckets = bucketByWeek([thisWeek, thisWeek, null, "not-a-date"], 3);
    expect(buckets[buckets.length - 1].v).toBe(2);
    expect(buckets.reduce((sum, b) => sum + b.v, 0)).toBe(2);
  });

  it("drops dates outside the requested window rather than mis-bucketing them", () => {
    const longAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const buckets = bucketByWeek([longAgo], 2);
    expect(buckets.reduce((sum, b) => sum + b.v, 0)).toBe(0);
  });
});

describe("bucketByDay", () => {
  it("zero-fills every bucket and ends on today", () => {
    const buckets = bucketByDay([], 7);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.v === 0)).toBe(true);
  });

  it("counts a date into today's bucket", () => {
    const buckets = bucketByDay([new Date().toISOString()], 3);
    expect(buckets[buckets.length - 1].v).toBe(1);
  });
});

describe("histogram", () => {
  it("zero-fills bins with no matching values", () => {
    expect(histogram([], 5, [0, 100])).toEqual([0, 0, 0, 0, 0]);
  });

  it("buckets values into the correct bins", () => {
    // domain [0,100], 5 bins => each bin spans 20
    const counts = histogram([5, 15, 25, 95, 100], 5, [0, 100]);
    expect(counts).toEqual([2, 1, 0, 0, 2]);
  });

  it("clamps out-of-domain values into the nearest edge bin", () => {
    const counts = histogram([-10, 500], 4, [0, 100]);
    expect(counts[0]).toBe(1);
    expect(counts[3]).toBe(1);
  });
});
