import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { prisma } from "../src/db.js";
import { createApplication, createDocument, createPosting } from "./helpers.js";

const app = createApp();

describe("GET /api/applications", () => {
  it("lists applications with posting + docs included", async () => {
    const posting = await createPosting();
    await createApplication(posting.id);
    const res = await request(app).get("/api/applications");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].posting.id).toBe(posting.id);
  });
});

describe("GET /api/applications/:id/prep-context", () => {
  it("joins posting, org profile, resolved tone, and matching resume bullets in one call", async () => {
    const tone = await prisma.tonePreset.create({
      data: { name: "Org Preferred Tone", guidance: "Be concise.", isDefault: false },
    });
    await prisma.tonePreset.create({
      data: { name: "Default Tone", guidance: "Be formal.", isDefault: true },
    });
    await prisma.orgProfile.create({
      data: { organizationName: "Chicago Cubs", notes: "Prior contact went well", preferredToneId: tone.id },
    });
    const matchingBullet = await prisma.resumeBullet.create({
      data: { category: "baseball_analytics", text: "Built a win-probability model", isActive: true },
    });
    const generalBullet = await prisma.resumeBullet.create({
      data: { category: "general", text: "Led a cross-functional team", isActive: true },
    });
    await prisma.resumeBullet.create({
      data: { category: "data_science", text: "Irrelevant bullet", isActive: true },
    });
    await prisma.resumeBullet.create({
      data: { category: "baseball_analytics", text: "Inactive bullet", isActive: false },
    });

    const posting = await createPosting({ organization: "Chicago Cubs", category: "BASEBALL_ANALYTICS" });
    const application = await createApplication(posting.id);

    const res = await request(app).get(`/api/applications/${application.id}/prep-context`);

    expect(res.status).toBe(200);
    expect(res.body.application.id).toBe(application.id);
    expect(res.body.application.posting.id).toBe(posting.id);
    expect(res.body.orgProfile.notes).toBe("Prior contact went well");
    expect(res.body.tonePreset.id).toBe(tone.id); // org's preferred tone wins over the default
    const bulletTexts = res.body.resumeBullets.map((b: { text: string }) => b.text).sort();
    expect(bulletTexts).toEqual([matchingBullet.text, generalBullet.text].sort());
  });

  it("falls back to the default tone preset when the org has no profile", async () => {
    const defaultTone = await prisma.tonePreset.create({
      data: { name: "Default Tone", guidance: "Be formal.", isDefault: true },
    });
    const posting = await createPosting({ organization: "No Profile Org" });
    const application = await createApplication(posting.id);

    const res = await request(app).get(`/api/applications/${application.id}/prep-context`);

    expect(res.status).toBe(200);
    expect(res.body.orgProfile).toBeNull();
    expect(res.body.tonePreset.id).toBe(defaultTone.id);
  });

  it("404s for a missing application", async () => {
    const res = await request(app).get("/api/applications/does-not-exist/prep-context");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/applications/:id", () => {
  it("updates stage", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id);
    const res = await request(app).patch(`/api/applications/${application.id}`).send({ stage: "APPLIED" });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("APPLIED");
  });

  it("rejects an invalid stage", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id);
    const res = await request(app)
      .patch(`/api/applications/${application.id}`)
      .send({ stage: "NOT_A_STAGE" });
    expect(res.status).toBe(400);
  });

  it("assigns resume/cover letter documents", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id);
    const resume = await createDocument({ kind: "resume" });
    const res = await request(app)
      .patch(`/api/applications/${application.id}`)
      .send({ resumeDocId: resume.id });
    expect(res.status).toBe(200);
    expect(res.body.resumeDocId).toBe(resume.id);
  });

  it("404s for a missing application", async () => {
    const res = await request(app).patch("/api/applications/does-not-exist").send({ stage: "APPLIED" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/applications/:id", () => {
  it("deletes an application", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id);
    const res = await request(app).delete(`/api/applications/${application.id}`);
    expect(res.status).toBe(204);
  });

  it("404s for a missing application", async () => {
    const res = await request(app).delete("/api/applications/does-not-exist");
    expect(res.status).toBe(404);
  });
});
