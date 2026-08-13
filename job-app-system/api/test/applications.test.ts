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

  // Regression test: resumeDocId/coverDocId must accept an explicit null to actually clear the
  // FK server-side. Previously the UI sent `{ [field]: undefined }` for "— none —", which
  // JSON.stringify drops from the request body entirely — the PATCH body became `{}` and the
  // column never cleared. See ui/src/pages/Pipeline.tsx's DocPicker/onAssignDoc.
  it("clears resumeDocId when explicitly set to null", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id);
    const resume = await createDocument({ kind: "resume" });

    const setRes = await request(app)
      .patch(`/api/applications/${application.id}`)
      .send({ resumeDocId: resume.id });
    expect(setRes.status).toBe(200);
    expect(setRes.body.resumeDocId).toBe(resume.id);

    const clearRes = await request(app)
      .patch(`/api/applications/${application.id}`)
      .send({ resumeDocId: null });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.resumeDocId).toBeNull();

    const getRes = await request(app).get("/api/applications");
    const fetched = getRes.body.find((a: { id: string }) => a.id === application.id);
    expect(fetched.resumeDocId).toBeNull();
  });
});

describe("PATCH /api/applications/:id — stage event writing", () => {
  it("writes exactly one ApplicationStageEvent on a real stage change", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id, { stage: "FOUND" });

    const res = await request(app).patch(`/api/applications/${application.id}`).send({ stage: "REVIEWING" });
    expect(res.status).toBe(200);

    const events = await prisma.applicationStageEvent.findMany({ where: { applicationId: application.id } });
    expect(events).toHaveLength(1);
    expect(events[0].fromStage).toBe("FOUND");
    expect(events[0].toStage).toBe("REVIEWING");
    expect(events[0].source).toBe("api");
  });

  it("writes zero events on a same-stage PATCH (e.g. editing notes)", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id, { stage: "REVIEWING" });

    await request(app).patch(`/api/applications/${application.id}`).send({ stage: "REVIEWING", notes: "hi" });

    const events = await prisma.applicationStageEvent.findMany({ where: { applicationId: application.id } });
    expect(events).toHaveLength(0);
  });

  it("writes zero events when notes are edited without a stage field at all", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id, { stage: "REVIEWING" });

    await request(app).patch(`/api/applications/${application.id}`).send({ notes: "hi" });

    const events = await prisma.applicationStageEvent.findMany({ where: { applicationId: application.id } });
    expect(events).toHaveLength(0);
  });

  it("auto-sets appliedAt on entering APPLIED", async () => {
    const posting = await createPosting();
    const application = await createApplication(posting.id, { stage: "REVIEWING" });

    const res = await request(app).patch(`/api/applications/${application.id}`).send({ stage: "APPLIED" });
    expect(res.status).toBe(200);
    expect(res.body.appliedAt).not.toBeNull();
  });

  it("does not clear an already-set appliedAt when moving to a later stage", async () => {
    const posting = await createPosting();
    const appliedAt = new Date("2026-01-01T00:00:00Z");
    const application = await createApplication(posting.id, { stage: "APPLIED", appliedAt });

    const res = await request(app).patch(`/api/applications/${application.id}`).send({ stage: "INTERVIEW" });
    expect(res.status).toBe(200);
    expect(new Date(res.body.appliedAt).toISOString()).toBe(appliedAt.toISOString());
  });

  it("does not overwrite appliedAt if it's already set and stage moves to APPLIED again from a re-entry", async () => {
    const posting = await createPosting();
    const appliedAt = new Date("2026-01-01T00:00:00Z");
    const application = await createApplication(posting.id, { stage: "INTERVIEW", appliedAt });

    const res = await request(app).patch(`/api/applications/${application.id}`).send({ stage: "APPLIED" });
    expect(new Date(res.body.appliedAt).toISOString()).toBe(appliedAt.toISOString());
  });
});

describe("POST /api/postings/:id/approve — seed stage event", () => {
  it("writes a seed ApplicationStageEvent when creating the initial application", async () => {
    const posting = await createPosting();
    const res = await request(app).post(`/api/postings/${posting.id}/approve`);
    expect(res.status).toBe(201);

    const events = await prisma.applicationStageEvent.findMany({ where: { applicationId: res.body.id } });
    expect(events).toHaveLength(1);
    expect(events[0].fromStage).toBeNull();
    expect(events[0].toStage).toBe("REVIEWING");
  });
});

describe("POST /api/applications/reorder", () => {
  it("renumbers all rows in the batch in one transaction", async () => {
    const posting = await createPosting();
    const a0 = await createApplication(posting.id, { stage: "APPLIED", order: 0 });
    const a1 = await createApplication(posting.id, { stage: "APPLIED", order: 1 });
    const a2 = await createApplication(posting.id, { stage: "APPLIED", order: 2 });

    const res = await request(app)
      .post("/api/applications/reorder")
      .send({
        updates: [
          { id: a2.id, stage: "APPLIED", order: 0 },
          { id: a0.id, stage: "APPLIED", order: 1 },
          { id: a1.id, stage: "APPLIED", order: 2 },
        ],
      });

    expect(res.status).toBe(200);
    const rows = await prisma.application.findMany({ where: { postingId: posting.id } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a2.id)?.order).toBe(0);
    expect(byId.get(a0.id)?.order).toBe(1);
    expect(byId.get(a1.id)?.order).toBe(2);
  });

  it("rolls back the entire batch when one id doesn't exist — every row stays unchanged", async () => {
    const posting = await createPosting();
    const a0 = await createApplication(posting.id, { stage: "APPLIED", order: 0 });
    const a1 = await createApplication(posting.id, { stage: "APPLIED", order: 1 });

    const res = await request(app)
      .post("/api/applications/reorder")
      .send({
        updates: [
          { id: a0.id, stage: "APPLIED", order: 5 },
          { id: "does-not-exist", stage: "APPLIED", order: 6 },
        ],
      });

    expect(res.status).toBe(400);
    const rows = await prisma.application.findMany({ where: { postingId: posting.id } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a0.id)?.order).toBe(0);
    expect(byId.get(a1.id)?.order).toBe(1);
  });

  it("writes exactly one ApplicationStageEvent and stamps appliedAt for an entry moving into APPLIED for the first time", async () => {
    const posting = await createPosting();
    const a0 = await createApplication(posting.id, { stage: "REVIEWING", order: 0 });
    const a1 = await createApplication(posting.id, { stage: "APPLIED", order: 0 });

    const res = await request(app)
      .post("/api/applications/reorder")
      .send({
        updates: [
          { id: a0.id, stage: "APPLIED", order: 0 },
          { id: a1.id, stage: "APPLIED", order: 1 },
        ],
      });

    expect(res.status).toBe(200);

    const events = await prisma.applicationStageEvent.findMany({ where: { applicationId: a0.id } });
    expect(events).toHaveLength(1);
    expect(events[0].fromStage).toBe("REVIEWING");
    expect(events[0].toStage).toBe("APPLIED");

    const a1Events = await prisma.applicationStageEvent.findMany({ where: { applicationId: a1.id } });
    expect(a1Events).toHaveLength(0); // a1 was already APPLIED — no stage change, no event

    const updatedA0 = await prisma.application.findUnique({ where: { id: a0.id } });
    expect(updatedA0?.appliedAt).not.toBeNull();
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
