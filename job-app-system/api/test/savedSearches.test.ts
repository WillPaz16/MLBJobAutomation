import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { prisma } from "../src/db.js";

const app = createApp();

describe("saved searches", () => {
  it("creates and lists saved searches", async () => {
    const create = await request(app)
      .post("/api/saved-searches")
      .send({ name: "Strong Baseball", query: "tab=baseball&minFit=65" });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe("Strong Baseball");
    expect(create.body.isDefault).toBe(false);

    const list = await request(app).get("/api/saved-searches");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].query).toBe("tab=baseball&minFit=65");
  });

  it("setting isDefault true un-defaults any other saved search", async () => {
    const first = await prisma.savedSearch.create({
      data: { name: "First", query: "tab=baseball", isDefault: true },
    });
    const create = await request(app)
      .post("/api/saved-searches")
      .send({ name: "Second", query: "tab=all", isDefault: true });
    expect(create.status).toBe(201);
    expect(create.body.isDefault).toBe(true);

    const refreshedFirst = await prisma.savedSearch.findUnique({ where: { id: first.id } });
    expect(refreshedFirst?.isDefault).toBe(false);
  });

  it("updates a saved search, including re-defaulting via PATCH", async () => {
    const a = await prisma.savedSearch.create({ data: { name: "A", query: "tab=baseball", isDefault: true } });
    const b = await prisma.savedSearch.create({ data: { name: "B", query: "tab=all" } });

    const patch = await request(app).patch(`/api/saved-searches/${b.id}`).send({ isDefault: true });
    expect(patch.status).toBe(200);
    expect(patch.body.isDefault).toBe(true);

    const refreshedA = await prisma.savedSearch.findUnique({ where: { id: a.id } });
    expect(refreshedA?.isDefault).toBe(false);
  });

  it("deletes a saved search", async () => {
    const s = await prisma.savedSearch.create({ data: { name: "Delete me", query: "tab=baseball" } });
    const del = await request(app).delete(`/api/saved-searches/${s.id}`);
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/saved-searches");
    expect(list.body).toHaveLength(0);
  });

  it("404s deleting or patching a missing saved search", async () => {
    const del = await request(app).delete("/api/saved-searches/does-not-exist");
    expect(del.status).toBe(404);

    const patch = await request(app).patch("/api/saved-searches/does-not-exist").send({ name: "x" });
    expect(patch.status).toBe(404);
  });
});
