import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { prisma } from "../src/db.js";

const app = createApp();

describe("tone presets", () => {
  it("creates and lists tone presets", async () => {
    const create = await request(app)
      .post("/api/tone-presets")
      .send({ name: "Formal - MLB Front Office", guidance: "Direct, credential-forward" });
    expect(create.status).toBe(201);
    expect(create.body.isDefault).toBe(false);

    const list = await request(app).get("/api/tone-presets");
    expect(list.body).toHaveLength(1);
  });

  it("rejects a duplicate name with a 409", async () => {
    await request(app).post("/api/tone-presets").send({ name: "Dup", guidance: "x" });
    const res = await request(app).post("/api/tone-presets").send({ name: "Dup", guidance: "y" });
    expect(res.status).toBe(409);
  });

  it("updates and deletes a tone preset", async () => {
    const preset = await prisma.tonePreset.create({ data: { name: "Casual", guidance: "x" } });
    const patch = await request(app).patch(`/api/tone-presets/${preset.id}`).send({ isDefault: true });
    expect(patch.status).toBe(200);
    expect(patch.body.isDefault).toBe(true);

    const del = await request(app).delete(`/api/tone-presets/${preset.id}`);
    expect(del.status).toBe(204);
  });

  it("404s deleting a missing tone preset", async () => {
    const res = await request(app).delete("/api/tone-presets/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("org profiles", () => {
  it("creates a profile and fetches it by organization name", async () => {
    const create = await request(app)
      .post("/api/org-profiles")
      .send({ organizationName: "Chicago Cubs", notes: "Emphasize R experience" });
    expect(create.status).toBe(201);

    const get = await request(app).get("/api/org-profiles/Chicago Cubs");
    expect(get.status).toBe(200);
    expect(get.body.notes).toBe("Emphasize R experience");
  });

  it("rejects a duplicate organizationName with a 409", async () => {
    await request(app).post("/api/org-profiles").send({ organizationName: "Dup Org" });
    const res = await request(app).post("/api/org-profiles").send({ organizationName: "Dup Org" });
    expect(res.status).toBe(409);
  });

  it("404s for an unknown organization", async () => {
    const res = await request(app).get("/api/org-profiles/Nonexistent Org");
    expect(res.status).toBe(404);
  });

  it("links a preferred tone via preferredToneId", async () => {
    const tone = await prisma.tonePreset.create({ data: { name: "Formal", guidance: "x" } });
    const create = await request(app)
      .post("/api/org-profiles")
      .send({ organizationName: "Atlanta Braves", preferredToneId: tone.id });
    expect(create.status).toBe(201);

    const get = await request(app).get("/api/org-profiles/Atlanta Braves");
    expect(get.body.preferredTone.name).toBe("Formal");
  });

  it("updates and deletes a profile", async () => {
    const profile = await prisma.orgProfile.create({ data: { organizationName: "Test Org" } });
    const patch = await request(app).patch(`/api/org-profiles/${profile.id}`).send({ notes: "updated" });
    expect(patch.status).toBe(200);
    expect(patch.body.notes).toBe("updated");

    const del = await request(app).delete(`/api/org-profiles/${profile.id}`);
    expect(del.status).toBe(204);
  });
});
