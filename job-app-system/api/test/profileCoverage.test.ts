import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createPosting, createApplication } from "./helpers.js";

const app = createApp();

describe("GET /api/profile/coverage", () => {
  it("returns zeroed/empty coverage when no profile exists yet", async () => {
    await createPosting({ title: "Data Scientist, Baseball Analytics", organization: "Cubs" });
    const res = await request(app).get("/api/profile/coverage");
    expect(res.status).toBe(200);
    expect(res.body.totalPostings).toBe(1);
    expect(res.body.skills).toEqual([]);
    expect(res.body.fitScores).toEqual([]);
    expect(res.body.tierCounts).toEqual({ Strong: 0, Good: 0, Fair: 0, Weak: 0 });
    expect(res.body.calibration).toEqual({
      dismissedAvg: null,
      dismissedCount: 0,
      appliedAvg: null,
      appliedCount: 0,
    });
  });

  it("scopes totalPostings to active, non-dismissed postings only", async () => {
    await createPosting({ title: "A" });
    await createPosting({ title: "B", closedAt: new Date() });
    await createPosting({ title: "C", dismissedAt: new Date() });
    const res = await request(app).get("/api/profile/coverage");
    expect(res.body.totalPostings).toBe(1);
  });

  it("counts per-skill postings/occurrences against a saved profile, matching computeFitScore's haystack", async () => {
    await request(app)
      .put("/api/profile")
      .send({ skills: "sql, plotly", coreSkills: "python" });

    await createPosting({
      title: "Senior Data Scientist, Baseball Analytics",
      organization: "Mets",
      description: "We use python and python daily. Also some sql work.",
    });
    await createPosting({
      title: "Usher",
      organization: "Brewers",
      description: "No relevant skills mentioned here.",
    });

    const res = await request(app).get("/api/profile/coverage");
    expect(res.status).toBe(200);

    const skillMap = Object.fromEntries(res.body.skills.map((s: any) => [s.term, s]));
    expect(skillMap.python.tier).toBe("core");
    expect(skillMap.python.postings).toBe(1);
    expect(skillMap.python.occurrences).toBe(2);
    expect(skillMap.sql.tier).toBe("secondary");
    expect(skillMap.sql.postings).toBe(1);
    expect(skillMap.sql.occurrences).toBe(1);
    // "plotly" matches zero postings in this fixture set.
    expect(skillMap.plotly.postings).toBe(0);
    expect(skillMap.plotly.occurrences).toBe(0);

    expect(res.body.fitScores.length).toBe(2);
  });

  it("computes calibration averages against dismissed vs applied postings, returning null for zero counts", async () => {
    await request(app).put("/api/profile").send({ coreSkills: "data scien", skills: "python" });

    // High-signal title -> higher score, marked as applied.
    const strong = await createPosting({
      title: "Senior Data Scientist, Baseball Analytics",
      organization: "Mets",
      description: "python python python",
    });
    await createApplication(strong.id, { stage: "APPLIED" });

    // Low-signal title, dismissed.
    await createPosting({ title: "Usher", organization: "Brewers", dismissedAt: new Date() });

    const res = await request(app).get("/api/profile/coverage");
    expect(res.body.calibration.appliedCount).toBe(1);
    expect(res.body.calibration.dismissedCount).toBe(1);
    expect(res.body.calibration.appliedAvg).toBeGreaterThan(res.body.calibration.dismissedAvg);
  });
});

describe("POST /api/profile/coverage/preview", () => {
  it("scores against the request body without persisting anything", async () => {
    await createPosting({
      title: "Senior Data Scientist, Baseball Analytics",
      organization: "Mets",
      description: "python everywhere",
    });

    const before = await request(app).get("/api/profile");
    expect(before.body).toBeNull();

    const preview = await request(app)
      .post("/api/profile/coverage/preview")
      .send({ skills: "python", coreSkills: "data scien" });
    expect(preview.status).toBe(200);
    expect(preview.body.totalPostings).toBe(1);
    const skillMap = Object.fromEntries(preview.body.skills.map((s: any) => [s.term, s]));
    expect(skillMap.python.postings).toBe(1);

    const after = await request(app).get("/api/profile");
    expect(after.body).toBeNull();
  });

  it("rejects an invalid draft the same way PUT / does", async () => {
    const res = await request(app).post("/api/profile/coverage/preview").send({});
    expect(res.status).toBe(400);
  });
});
