import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";

const app = createApp();

describe("GET /api/profile", () => {
  it("returns null when no profile has been created", async () => {
    const res = await request(app).get("/api/profile");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe("PUT /api/profile", () => {
  it("creates the singleton profile on first call", async () => {
    const res = await request(app).put("/api/profile").send({ skills: "python, sql" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("profile");
    expect(res.body.skills).toBe("python, sql");

    const get = await request(app).get("/api/profile");
    expect(get.body.skills).toBe("python, sql");
  });

  it("upserts — a second call overwrites the existing singleton rather than creating a new row", async () => {
    await request(app).put("/api/profile").send({ skills: "python" });
    const res = await request(app)
      .put("/api/profile")
      .send({ skills: "python, r", preferredCategories: "data_science" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("profile");
    expect(res.body.skills).toBe("python, r");
    expect(res.body.preferredCategories).toBe("data_science");
  });

  it("rejects an empty skills value", async () => {
    const res = await request(app).put("/api/profile").send({ skills: "" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing skills field", async () => {
    const res = await request(app).put("/api/profile").send({});
    expect(res.status).toBe(400);
  });
});
