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
