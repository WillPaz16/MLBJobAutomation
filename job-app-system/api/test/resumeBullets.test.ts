import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { prisma } from "../src/db.js";

const app = createApp();

describe("GET /api/resume-bullets", () => {
  it("lists bullets, optionally filtered by category and isActive", async () => {
    await prisma.resumeBullet.create({ data: { category: "baseball_analytics", text: "Built a model" } });
    await prisma.resumeBullet.create({ data: { category: "data_science", text: "Shipped a pipeline" } });
    await prisma.resumeBullet.create({
      data: { category: "baseball_analytics", text: "Old bullet", isActive: false },
    });

    const res = await request(app).get("/api/resume-bullets?category=baseball_analytics&isActive=true");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe("Built a model");
  });
});

describe("POST /api/resume-bullets", () => {
  it("creates a bullet defaulting isActive to true", async () => {
    const res = await request(app)
      .post("/api/resume-bullets")
      .send({ category: "general", text: "Led a cross-functional project" });
    expect(res.status).toBe(201);
    expect(res.body.isActive).toBe(true);
  });

  it("rejects a missing text field", async () => {
    const res = await request(app).post("/api/resume-bullets").send({ category: "general" });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/resume-bullets/:id", () => {
  it("updates a bullet", async () => {
    const bullet = await prisma.resumeBullet.create({ data: { category: "general", text: "x" } });
    const res = await request(app).patch(`/api/resume-bullets/${bullet.id}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it("404s for a missing bullet", async () => {
    const res = await request(app).patch("/api/resume-bullets/does-not-exist").send({ isActive: false });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/resume-bullets/:id", () => {
  it("deletes a bullet", async () => {
    const bullet = await prisma.resumeBullet.create({ data: { category: "general", text: "x" } });
    const res = await request(app).delete(`/api/resume-bullets/${bullet.id}`);
    expect(res.status).toBe(204);
  });

  it("404s for a missing bullet", async () => {
    const res = await request(app).delete("/api/resume-bullets/does-not-exist");
    expect(res.status).toBe(404);
  });
});
