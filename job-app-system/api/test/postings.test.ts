import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createPosting } from "./helpers.js";

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

  it("rejects an out-of-range take value", async () => {
    const res = await request(app).get("/api/postings?take=99999");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/postings/:id", () => {
  it("404s for a missing posting", async () => {
    const res = await request(app).get("/api/postings/does-not-exist");
    expect(res.status).toBe(404);
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
