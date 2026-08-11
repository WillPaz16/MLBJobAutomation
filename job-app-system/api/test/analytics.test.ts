import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createApplication, createPosting } from "./helpers.js";

const app = createApp();

describe("GET /api/analytics/summary", () => {
  it("returns zeroed summary with no applications", async () => {
    const res = await request(app).get("/api/analytics/summary");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 0,
      byStage: {},
      bySource: {},
      avgResponseDays: null,
      avgResponseDaysByStage: {},
    });
  });

  it("counts by stage and source", async () => {
    const posting = await createPosting();
    await createApplication(posting.id, { stage: "APPLIED" });
    await createApplication(posting.id, { stage: "APPLIED" });
    await createApplication(posting.id, { stage: "INTERVIEW" });

    const res = await request(app).get("/api/analytics/summary");
    expect(res.body.total).toBe(3);
    expect(res.body.byStage).toEqual({ APPLIED: 2, INTERVIEW: 1 });
  });

  it("computes avg response days only for tracked stages with appliedAt set", async () => {
    const posting = await createPosting();
    const appliedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    await createApplication(posting.id, { stage: "APPLIED", appliedAt });
    // FOUND/REVIEWING should never contribute even if appliedAt happens to be set
    await createApplication(posting.id, { stage: "FOUND", appliedAt });

    const res = await request(app).get("/api/analytics/summary");
    expect(res.body.avgResponseDaysByStage.APPLIED).toBeCloseTo(5, 0);
    expect(res.body.avgResponseDaysByStage.FOUND).toBeUndefined();
  });
});

describe("GET /api/analytics/timeseries", () => {
  it("returns 26 zero-filled weeks with no data", async () => {
    const res = await request(app).get("/api/analytics/timeseries");
    expect(res.status).toBe(200);
    expect(res.body.weeks).toHaveLength(26);
    expect(res.body.discovered).toHaveLength(26);
    expect(res.body.applicationsCreated).toHaveLength(26);
    expect(res.body.applied).toHaveLength(26);
    expect(res.body.discovered.every((v: number) => v === 0)).toBe(true);
    expect(res.body.fitScores).toEqual([]);
  });

  it("buckets discoveredAt into the current week and counts sum correctly", async () => {
    await createPosting();
    await createPosting();
    const res = await request(app).get("/api/analytics/timeseries");
    const total = res.body.discovered.reduce((a: number, b: number) => a + b, 0);
    expect(total).toBe(2);
    // Both postings were just created, so they should land in the last (current) bucket.
    expect(res.body.discovered[res.body.discovered.length - 1]).toBe(2);
  });

  it("buckets application createdAt/appliedAt and sums correctly", async () => {
    const posting = await createPosting();
    await createApplication(posting.id, { stage: "APPLIED", appliedAt: new Date() });
    await createApplication(posting.id, { stage: "FOUND" });

    const res = await request(app).get("/api/analytics/timeseries");
    const createdTotal = res.body.applicationsCreated.reduce((a: number, b: number) => a + b, 0);
    const appliedTotal = res.body.applied.reduce((a: number, b: number) => a + b, 0);
    expect(createdTotal).toBe(2);
    expect(appliedTotal).toBe(1);
  });
});
