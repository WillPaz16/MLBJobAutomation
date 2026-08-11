import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createPosting, createSource } from "./helpers.js";

const app = createApp();

describe("GET /api/postings", () => {
  it("lists postings", async () => {
    await createPosting({ title: "Data Scientist" });
    const res = await request(app).get("/api/postings");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Data Scientist");
  });

  it("filters by category", async () => {
    await createPosting({ category: "BASEBALL_OPS", title: "Ops role" });
    await createPosting({ category: "DATA_SCIENCE", title: "DS role" });
    const res = await request(app).get("/api/postings?category=DATA_SCIENCE");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("DS role");
  });

  it("filters by location substring", async () => {
    await createPosting({ location: "Chicago, IL" });
    await createPosting({ location: "Remote" });
    const res = await request(app).get("/api/postings?location=Chicago");
    expect(res.body).toHaveLength(1);
  });

  it("searches by title or organization text", async () => {
    await createPosting({ title: "Baseball Analytics Fellow", organization: "Cubs" });
    await createPosting({ title: "Software Engineer", organization: "Astros" });
    const res = await request(app).get("/api/postings?q=Analytics");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Baseball Analytics Fellow");
  });

  it("respects take/skip pagination", async () => {
    await createPosting();
    await createPosting();
    await createPosting();
    const res = await request(app).get("/api/postings?take=1&skip=1");
    expect(res.body).toHaveLength(1);
  });

  it("exposes the total matching count via X-Total-Count while the body stays capped by take", async () => {
    await createPosting({ category: "DATA_SCIENCE" });
    await createPosting({ category: "DATA_SCIENCE" });
    await createPosting({ category: "DATA_SCIENCE" });
    await createPosting({ category: "BASEBALL_OPS" }); // excluded by the filter below

    const res = await request(app).get("/api/postings?category=DATA_SCIENCE&take=2");
    expect(res.headers["x-total-count"]).toBe("3"); // full filtered count, not just this page
    expect(res.body).toHaveLength(2); // page size still respected
  });

  it("rejects an out-of-range take value", async () => {
    const res = await request(app).get("/api/postings?take=99999");
    expect(res.status).toBe(400);
  });

  it("filters by source platform type", async () => {
    const greenhouseSource = await createSource("gh-test", "greenhouse");
    const leverSource = await createSource("lever-test", "lever");
    await createPosting({ sourceId: greenhouseSource.id, title: "Greenhouse role" });
    await createPosting({ sourceId: leverSource.id, title: "Lever role" });

    const res = await request(app).get("/api/postings?source=lever");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Lever role");
  });

  it("defaults to active-only (closedAt: null), excluding closed postings", async () => {
    await createPosting({ title: "Open role" });
    await createPosting({ title: "Closed role", closedAt: new Date() });

    const res = await request(app).get("/api/postings");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Open role");
  });

  it("status=closed returns only closed postings", async () => {
    await createPosting({ title: "Open role" });
    await createPosting({ title: "Closed role", closedAt: new Date() });

    const res = await request(app).get("/api/postings?status=closed");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Closed role");
  });

  it("status=all returns both open and closed postings", async () => {
    await createPosting({ title: "Open role" });
    await createPosting({ title: "Closed role", closedAt: new Date() });

    const res = await request(app).get("/api/postings?status=all");
    expect(res.body).toHaveLength(2);
  });

  it("sorts by postedAt ascending when requested", async () => {
    await createPosting({ title: "Newer", postedAt: new Date("2026-02-01") });
    await createPosting({ title: "Older", postedAt: new Date("2026-01-01") });

    const res = await request(app).get("/api/postings?sort=postedAt_asc");
    expect(res.body.map((p: { title: string }) => p.title)).toEqual(["Older", "Newer"]);
  });

  it("hideDuplicates=true excludes flagged-duplicate postings but keeps rejected ones", async () => {
    const original = await createPosting({ title: "Original" });
    await createPosting({ title: "Flagged duplicate", possibleDuplicateOfId: original.id });
    await createPosting({
      title: "Rejected as duplicate",
      possibleDuplicateOfId: original.id,
      duplicateRejected: true,
    });

    const res = await request(app).get("/api/postings?hideDuplicates=true");
    const titles = res.body.map((p: { title: string }) => p.title).sort();
    expect(titles).toEqual(["Original", "Rejected as duplicate"]);
  });

  it("combines a text search with hideDuplicates without one condition clobbering the other", async () => {
    const original = await createPosting({ title: "Baseball Analyst Original", organization: "Cubs" });
    await createPosting({
      title: "Baseball Analyst Flagged",
      organization: "Cubs",
      possibleDuplicateOfId: original.id,
    });
    await createPosting({ title: "Unrelated Role", organization: "Cubs" });

    const res = await request(app).get("/api/postings?q=Analyst&hideDuplicates=true");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Baseball Analyst Original");
  });

  it("filters by exact organization (team/company), not just substring search", async () => {
    await createPosting({ organization: "Chicago Cubs", title: "Cubs role" });
    await createPosting({ organization: "Chicago White Sox", title: "White Sox role" });

    const res = await request(app).get(`/api/postings?organization=${encodeURIComponent("Chicago Cubs")}`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Cubs role");
  });

  it("excludes dismissed postings by default", async () => {
    await createPosting({ title: "Kept" });
    await createPosting({ title: "Dismissed", dismissedAt: new Date() });

    const res = await request(app).get("/api/postings");
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Kept");
  });

  it("showDismissed=true includes dismissed postings", async () => {
    await createPosting({ title: "Kept" });
    await createPosting({ title: "Dismissed", dismissedAt: new Date() });

    const res = await request(app).get("/api/postings?showDismissed=true");
    expect(res.body).toHaveLength(2);
  });
});

describe("GET /api/postings fit scoring", () => {
  it("attaches no fitScore/matchedSkills when no CandidateProfile exists", async () => {
    await createPosting({ title: "Data Scientist" });
    const res = await request(app).get("/api/postings");
    expect(res.status).toBe(200);
    expect(res.body[0].fitScore).toBeUndefined();
    expect(res.body[0].matchedSkills).toBeUndefined();
  });

  it("attaches fitScore/matchedSkills to every posting when a profile exists", async () => {
    await request(app).put("/api/profile").send({ skills: "python, sql" });
    await createPosting({ title: "Python Data Scientist", description: "Uses Python and SQL daily" });
    const res = await request(app).get("/api/postings");
    expect(res.status).toBe(200);
    expect(typeof res.body[0].fitScore).toBe("number");
    expect(res.body[0].matchedSkills).toEqual(expect.arrayContaining(["python"]));
  });

  it("sort=fit_desc orders by computed fit score, highest first, and still paginates via take/skip", async () => {
    await request(app).put("/api/profile").send({ skills: "python, sql, r" });
    await createPosting({ title: "No Match Role", description: "unrelated" });
    await createPosting({ title: "Full Match Role", description: "python sql r" });
    await createPosting({ title: "Partial Match Role", description: "python only" });

    const res = await request(app).get("/api/postings?sort=fit_desc");
    expect(res.status).toBe(200);
    const titles = res.body.map((p: { title: string }) => p.title);
    expect(titles).toEqual(["Full Match Role", "Partial Match Role", "No Match Role"]);

    const paged = await request(app).get("/api/postings?sort=fit_desc&take=1&skip=1");
    expect(paged.body).toHaveLength(1);
    expect(paged.body[0].title).toBe("Partial Match Role");
    expect(paged.headers["x-total-count"]).toBe("3");
  });

  it("sort=fit_desc with no profile falls back to a harmless no-op ordering (no error)", async () => {
    await createPosting({ title: "A" });
    await createPosting({ title: "B" });
    const res = await request(app).get("/api/postings?sort=fit_desc");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("sort=fit_desc produces a stable order across repeated requests when scores tie", async () => {
    await createPosting({ title: "Tie A", description: "no relevant terms" });
    await createPosting({ title: "Tie B", description: "no relevant terms" });
    await createPosting({ title: "Tie C", description: "no relevant terms" });

    const first = await request(app).get("/api/postings?sort=fit_desc");
    const second = await request(app).get("/api/postings?sort=fit_desc");
    expect(first.body.map((p: { id: string }) => p.id)).toEqual(second.body.map((p: { id: string }) => p.id));
  });
});

describe("GET /api/postings/organizations", () => {
  it("returns distinct, sorted, non-dismissed organizations", async () => {
    await createPosting({ organization: "Chicago Cubs" });
    await createPosting({ organization: "Chicago Cubs" });
    await createPosting({ organization: "Boston Red Sox" });
    await createPosting({ organization: "Only Dismissed Org", dismissedAt: new Date() });

    const res = await request(app).get("/api/postings/organizations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(["Boston Red Sox", "Chicago Cubs"]);
  });
});

describe("GET /api/postings/:id", () => {
  it("404s for a missing posting", async () => {
    const res = await request(app).get("/api/postings/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("attaches fitScore/matchedSkills when a profile exists, consistent with the list endpoint", async () => {
    await request(app).put("/api/profile").send({ skills: "python, sql" });
    const posting = await createPosting({
      title: "Python Data Scientist",
      description: "Uses Python and SQL daily",
    });
    const res = await request(app).get(`/api/postings/${posting.id}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.fitScore).toBe("number");
    expect(res.body.matchedSkills).toEqual(expect.arrayContaining(["python"]));
  });
});

describe("PATCH /api/postings/:id", () => {
  it("updates allowed fields", async () => {
    const posting = await createPosting({ category: "OTHER" });
    const res = await request(app)
      .patch(`/api/postings/${posting.id}`)
      .send({ category: "DATA_SCIENCE" });
    expect(res.status).toBe(200);
    expect(res.body.category).toBe("DATA_SCIENCE");
  });

  it("rejects an invalid category", async () => {
    const posting = await createPosting();
    const res = await request(app)
      .patch(`/api/postings/${posting.id}`)
      .send({ category: "NOT_REAL" });
    expect(res.status).toBe(400);
  });

  it("404s for a missing posting", async () => {
    const res = await request(app).patch("/api/postings/does-not-exist").send({ category: "OTHER" });
    expect(res.status).toBe(404);
  });

  it("rejects a flagged duplicate match, keeping the link but stopping the flag", async () => {
    const original = await createPosting({ title: "Original" });
    const flagged = await createPosting({ title: "Flagged", possibleDuplicateOfId: original.id });

    const res = await request(app).patch(`/api/postings/${flagged.id}`).send({ duplicateRejected: true });
    expect(res.status).toBe(200);
    expect(res.body.duplicateRejected).toBe(true);
    expect(res.body.possibleDuplicateOfId).toBe(original.id);
  });

  it("dismisses a posting", async () => {
    const posting = await createPosting();
    const res = await request(app)
      .patch(`/api/postings/${posting.id}`)
      .send({ dismissedAt: new Date().toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.dismissedAt).not.toBeNull();

    const list = await request(app).get("/api/postings");
    expect(list.body.find((p: { id: string }) => p.id === posting.id)).toBeUndefined();
  });

  it("un-dismisses a posting by setting dismissedAt back to null", async () => {
    const posting = await createPosting({ dismissedAt: new Date() });
    const res = await request(app).patch(`/api/postings/${posting.id}`).send({ dismissedAt: null });
    expect(res.status).toBe(200);
    expect(res.body.dismissedAt).toBeNull();

    const list = await request(app).get("/api/postings");
    expect(list.body.find((p: { id: string }) => p.id === posting.id)).toBeDefined();
  });
});

describe("DELETE /api/postings/:id", () => {
  it("deletes a posting", async () => {
    const posting = await createPosting();
    const res = await request(app).delete(`/api/postings/${posting.id}`);
    expect(res.status).toBe(204);
    const getRes = await request(app).get(`/api/postings/${posting.id}`);
    expect(getRes.status).toBe(404);
  });

  it("404s for a missing posting", async () => {
    const res = await request(app).delete("/api/postings/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/postings/manual", () => {
  const body = {
    title: "Baseball Operations Fellow",
    organization: "New York Yankees",
    location: "Bronx, NY",
    url: "https://www.teamworkonline.com/example-yankees-fellow",
    category: "BASEBALL_OPS",
  };

  it("creates a posting with a manual source scoped to the organization", async () => {
    const res = await request(app).post("/api/postings/manual").send(body);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(body.title);
    expect(res.body.category).toBe("BASEBALL_OPS");

    const list = await request(app).get("/api/postings?q=Yankees");
    expect(list.body[0].source.type).toBe("manual");
    expect(list.body[0].source.name).toBe("manual:New York Yankees");
  });

  it("is idempotent — pasting the same URL twice doesn't create a duplicate", async () => {
    const first = await request(app).post("/api/postings/manual").send(body);
    const second = await request(app).post("/api/postings/manual").send(body);
    expect(second.body.id).toBe(first.body.id);

    const list = await request(app).get("/api/postings?q=Yankees");
    expect(list.body).toHaveLength(1);
  });

  it("defaults category to OTHER when omitted", async () => {
    const res = await request(app)
      .post("/api/postings/manual")
      .send({ title: "x", organization: "y", url: "https://example.com/job" });
    expect(res.body.category).toBe("OTHER");
  });

  it("rejects a missing url", async () => {
    const res = await request(app).post("/api/postings/manual").send({ title: "x", organization: "y" });
    expect(res.status).toBe(400);
  });

  it("rejects a non-URL string for url", async () => {
    const res = await request(app)
      .post("/api/postings/manual")
      .send({ title: "x", organization: "y", url: "not-a-url" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/postings/:id/approve", () => {
  it("creates a REVIEWING application", async () => {
    const posting = await createPosting();
    const res = await request(app).post(`/api/postings/${posting.id}/approve`);
    expect(res.status).toBe(201);
    expect(res.body.stage).toBe("REVIEWING");
    expect(res.body.postingId).toBe(posting.id);
  });

  it("404s for a missing posting", async () => {
    const res = await request(app).post("/api/postings/does-not-exist/approve");
    expect(res.status).toBe(404);
  });
});
