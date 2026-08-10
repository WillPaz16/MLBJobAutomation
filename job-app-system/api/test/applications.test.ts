import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
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
