import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createApplication, createDocument, createPosting } from "./helpers.js";

const app = createApp();

describe("GET /api/documents", () => {
  it("lists documents, optionally filtered by kind", async () => {
    await createDocument({ kind: "resume" });
    await createDocument({ kind: "cover_letter" });
    const res = await request(app).get("/api/documents?kind=resume");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].kind).toBe("resume");
  });
});

describe("POST /api/documents", () => {
  it("creates a document", async () => {
    const res = await request(app)
      .post("/api/documents")
      .send({ kind: "resume", label: "New Resume", filePath: "/tmp/new.pdf" });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe("New Resume");
  });

  it("rejects an invalid kind", async () => {
    const res = await request(app)
      .post("/api/documents")
      .send({ kind: "not_a_kind", label: "x", filePath: "/tmp/x.pdf" });
    expect(res.status).toBe(400);
  });

  it("rejects a missing label", async () => {
    const res = await request(app).post("/api/documents").send({ kind: "resume", filePath: "/tmp/x.pdf" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/documents/:id", () => {
  it("deletes an unreferenced document", async () => {
    const doc = await createDocument();
    const res = await request(app).delete(`/api/documents/${doc.id}`);
    expect(res.status).toBe(204);
  });

  it("409s when the document is still assigned to an application", async () => {
    const posting = await createPosting();
    const doc = await createDocument({ kind: "resume" });
    await createApplication(posting.id, { resumeDocId: doc.id });
    const res = await request(app).delete(`/api/documents/${doc.id}`);
    expect(res.status).toBe(409);
  });

  it("404s for a missing document", async () => {
    const res = await request(app).delete("/api/documents/does-not-exist");
    expect(res.status).toBe(404);
  });
});
