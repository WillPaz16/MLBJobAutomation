import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { prisma } from "../src/db.js";
import { createApplication, createPosting, createStageEvent } from "./helpers.js";

const app = createApp();

describe("GET /api/analytics/summary", () => {
  it("returns zeroed summary with no applications", async () => {
    const res = await request(app).get("/api/analytics/summary");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 0,
      byStage: {},
      bySource: {},
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

  it("no longer returns the removed fake response-time fields", async () => {
    const res = await request(app).get("/api/analytics/summary");
    expect(res.body.avgResponseDays).toBeUndefined();
    expect(res.body.avgResponseDaysByStage).toBeUndefined();
  });

  it("filters by category and isMlbTeam", async () => {
    const mlbPosting = await createPosting({ category: "BASEBALL_OPS", isMlbTeam: true });
    const dsPosting = await createPosting({ category: "DATA_SCIENCE", isMlbTeam: false });
    await createApplication(mlbPosting.id);
    await createApplication(dsPosting.id);

    const res = await request(app).get("/api/analytics/summary?category=DATA_SCIENCE");
    expect(res.body.total).toBe(1);

    const res2 = await request(app).get("/api/analytics/summary?isMlbTeam=true");
    expect(res2.body.total).toBe(1);
  });

  it("isMlbTeam=false returns only the non-MLB application, not its inverse", async () => {
    const mlbPosting = await createPosting({ category: "BASEBALL_OPS", isMlbTeam: true });
    const dsPosting = await createPosting({ category: "DATA_SCIENCE", isMlbTeam: false });
    await createApplication(mlbPosting.id, { stage: "INTERVIEW" });
    await createApplication(dsPosting.id, { stage: "APPLIED" });

    const res = await request(app).get("/api/analytics/summary?isMlbTeam=false");
    expect(res.body.total).toBe(1);
    expect(res.body.byStage).toEqual({ APPLIED: 1 });
  });

  it("rejects a non-boolean isMlbTeam value with 400", async () => {
    const res = await request(app).get("/api/analytics/summary?isMlbTeam=notabool");
    expect(res.status).toBe(400);
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

  it("respects the weeks query param", async () => {
    const res = await request(app).get("/api/analytics/timeseries?weeks=4");
    expect(res.body.weeks).toHaveLength(4);
    expect(res.body.discovered).toHaveLength(4);
  });

  it("caps weeks at 104", async () => {
    const res = await request(app).get("/api/analytics/timeseries?weeks=500");
    expect(res.status).toBe(400);
  });

  it("invalidates the fit-score cache when the profile is updated", async () => {
    const posting = await createPosting({ title: "Data Scientist", description: "python sql" });
    await prisma.candidateProfile.create({
      data: { id: "profile", skills: "python", coreSkills: "python" },
    });

    const res1 = await request(app).get("/api/analytics/timeseries");
    const firstScore = res1.body.fitScores[0];

    await prisma.candidateProfile.update({
      where: { id: "profile" },
      data: { skills: "python,sql", coreSkills: "python,sql" },
    });

    const res2 = await request(app).get("/api/analytics/timeseries");
    const secondScore = res2.body.fitScores[0];

    expect(secondScore).toBeGreaterThan(firstScore);
    void posting;
  });
});

describe("GET /api/analytics/funnel", () => {
  it("returns empty/null-safe shape with no applications", async () => {
    const res = await request(app).get("/api/analytics/funnel");
    expect(res.status).toBe(200);
    expect(res.body.reached).toEqual({});
    expect(res.body.conversion).toEqual({});
    expect(res.body.daysInStage).toEqual({});
    expect(res.body.medianDaysToResponse).toBeNull();
    expect(res.body.meanDaysToResponse).toBeNull();
    expect(res.body.sampleSizes.totalApplications).toBe(0);
  });

  it("computes reached counts and conversion including backfill events", async () => {
    const posting = await createPosting();
    const app1 = await createApplication(posting.id, { stage: "APPLIED" });
    await createStageEvent(app1.id, { fromStage: null, toStage: "FOUND", source: "backfill" });
    await createStageEvent(app1.id, { fromStage: "FOUND", toStage: "APPLIED", source: "backfill" });

    const app2 = await createApplication(posting.id, { stage: "FOUND" });
    await createStageEvent(app2.id, { fromStage: null, toStage: "FOUND", source: "api" });

    const res = await request(app).get("/api/analytics/funnel");
    expect(res.body.reached.FOUND).toBe(2);
    expect(res.body.reached.APPLIED).toBe(1);
    expect(res.body.conversion.APPLIED).toBe(1);
    expect(res.body.conversion.FOUND).toBe(2); // 2 reached FOUND / 1 reached APPLIED
  });

  it("returns null conversion when nothing has reached APPLIED yet", async () => {
    const posting = await createPosting();
    const app1 = await createApplication(posting.id, { stage: "FOUND" });
    await createStageEvent(app1.id, { fromStage: null, toStage: "FOUND" });

    const res = await request(app).get("/api/analytics/funnel");
    expect(res.body.conversion.FOUND).toBeNull();
  });

  it("isMlbTeam=false filters to only the non-MLB application, not its inverse", async () => {
    const mlbPosting = await createPosting({ category: "BASEBALL_OPS", isMlbTeam: true });
    const dsPosting = await createPosting({ category: "DATA_SCIENCE", isMlbTeam: false });
    const mlbApp = await createApplication(mlbPosting.id, { stage: "INTERVIEW" });
    await createStageEvent(mlbApp.id, { fromStage: null, toStage: "INTERVIEW" });
    const dsApp = await createApplication(dsPosting.id, { stage: "FOUND" });
    await createStageEvent(dsApp.id, { fromStage: null, toStage: "FOUND" });

    const res = await request(app).get("/api/analytics/funnel?isMlbTeam=false");
    expect(res.body.sampleSizes.totalApplications).toBe(1);
    expect(res.body.reached.FOUND).toBe(1);
    expect(res.body.reached.INTERVIEW).toBeUndefined();
  });

  it("rejects a non-boolean isMlbTeam value with 400", async () => {
    const res = await request(app).get("/api/analytics/funnel?isMlbTeam=notabool");
    expect(res.status).toBe(400);
  });

  it("computes daysInStage only across consecutive api-sourced events, excluding backfill", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id, { stage: "INTERVIEW" });
    const base = new Date("2026-01-01T00:00:00Z");
    await createStageEvent(application.id, {
      fromStage: null,
      toStage: "FOUND",
      source: "backfill",
      createdAt: base,
    });
    await createStageEvent(application.id, {
      fromStage: "FOUND",
      toStage: "APPLIED",
      source: "api",
      createdAt: new Date(base.getTime() + 2 * 24 * 60 * 60 * 1000),
    });
    await createStageEvent(application.id, {
      fromStage: "APPLIED",
      toStage: "INTERVIEW",
      source: "api",
      createdAt: new Date(base.getTime() + 5 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app).get("/api/analytics/funnel");
    // The FOUND->APPLIED gap spans a backfill event on one side, so it's excluded; only the
    // APPLIED->INTERVIEW gap (both api-sourced) should be counted, and it's 3 days.
    expect(res.body.daysInStage.FOUND).toBeUndefined();
    expect(res.body.daysInStage.APPLIED.n).toBe(1);
    expect(res.body.daysInStage.APPLIED.median).toBeCloseTo(3, 5);
  });

  it("computes medianDaysToResponse from APPLIED to the first subsequent api-sourced response stage", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id, { stage: "REJECTED" });
    const base = new Date("2026-01-01T00:00:00Z");
    await createStageEvent(application.id, {
      fromStage: "REVIEWING",
      toStage: "APPLIED",
      source: "api",
      createdAt: base,
    });
    await createStageEvent(application.id, {
      fromStage: "APPLIED",
      toStage: "REJECTED",
      source: "api",
      createdAt: new Date(base.getTime() + 10 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app).get("/api/analytics/funnel");
    expect(res.body.medianDaysToResponse).toBeCloseTo(10, 5);
    expect(res.body.sampleSizes.responseSampleSize).toBe(1);
  });
});

describe("GET /api/analytics/market", () => {
  it("returns sensible zero/null values with no postings", async () => {
    const res = await request(app).get("/api/analytics/market");
    expect(res.status).toBe(200);
    expect(res.body.timeToClose.mlb.every((v: number) => v === 0)).toBe(true);
    expect(res.body.discoveryLag.n).toBe(0);
    expect(res.body.discoveryLag.median).toBeNull();
    expect(res.body.dismissalBreakdown.category).toEqual([]);
    expect(res.body.fitScoreByCohort.dismissed.n).toBe(0);
  });

  it("buckets time-to-close by MLB vs non-MLB and tracks postedAt vs discoveredAt fallback", async () => {
    const discoveredAt = new Date("2026-01-01T00:00:00Z");
    const closedAt = new Date("2026-01-06T00:00:00Z"); // 5 days later -> "0-7" bucket
    await createPosting({
      isMlbTeam: true,
      discoveredAt,
      closedAt,
      postedAt: null,
    });
    const postedAt = new Date("2026-01-01T00:00:00Z");
    const closedAt2 = new Date("2026-01-20T00:00:00Z"); // 19 days -> "15-30" bucket
    await createPosting({
      isMlbTeam: false,
      postedAt,
      discoveredAt: postedAt,
      closedAt: closedAt2,
    });

    const res = await request(app).get("/api/analytics/market");
    expect(res.body.timeToClose.mlb[0]).toBe(1); // 0-7 bucket
    expect(res.body.timeToClose.nonMlb[2]).toBe(1); // 15-30 bucket
    expect(res.body.timeToClose.discoveredAtFallbackCount).toBe(1);
    expect(res.body.timeToClose.postedAtBasedCount).toBe(1);
  });

  it("computes dismissal breakdown by category", async () => {
    await createPosting({ category: "BASEBALL_OPS", dismissedAt: new Date() });
    await createPosting({ category: "BASEBALL_OPS", dismissedAt: new Date() });
    await createPosting({ category: "DATA_SCIENCE", dismissedAt: new Date() });
    await createPosting({ category: "DATA_SCIENCE" }); // not dismissed, excluded

    const res = await request(app).get("/api/analytics/market");
    const cats = Object.fromEntries(res.body.dismissalBreakdown.category.map((e: { key: string; value: number }) => [e.key, e.value]));
    expect(cats.BASEBALL_OPS).toBe(2);
    expect(cats.DATA_SCIENCE).toBe(1);
  });

  it("computes fit score by cohort (dismissed / applied / other), mutually exclusive", async () => {
    await prisma.candidateProfile.create({ data: { id: "profile", skills: "python", coreSkills: "python" } });
    const dismissed = await createPosting({ title: "Python Engineer", dismissedAt: new Date() });
    const applied = await createPosting({ title: "Python Analyst" });
    await createApplication(applied.id);
    const other = await createPosting({ title: "Generic role" });

    const res = await request(app).get("/api/analytics/market");
    expect(res.body.fitScoreByCohort.dismissed.n).toBe(1);
    expect(res.body.fitScoreByCohort.applied.n).toBe(1);
    expect(res.body.fitScoreByCohort.other.n).toBe(1);
    void dismissed;
    void other;
  });
});
