import { describe, expect, it } from "vitest";
import request from "supertest";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createApp } from "../src/index.js";
import { createApplication, createDocument, createPosting } from "./helpers.js";

const app = createApp();

const RESUME_DIR = process.env.DOCS_RESUME_DIR as string;
const COVER_LETTER_DIR = process.env.DOCS_COVER_LETTER_DIR as string;

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

describe("POST /api/documents/upload", () => {
  it("round-trips raw bytes into managed storage", async () => {
    const bytes = Buffer.from("%PDF-1.4 fake pdf bytes");
    const res = await request(app)
      .post("/api/documents/upload?kind=resume&filename=My%20Resume.pdf")
      .set("Content-Type", "application/pdf")
      .send(bytes);
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("resume");
    expect(res.body.storageKey).toBeTruthy();
    expect(res.body.sizeBytes).toBe(bytes.length);

    const fileRes = await request(app).get(`/api/documents/${res.body.id}/file`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers["content-type"]).toBe("application/pdf");
  });

  it("rejects an unsupported kind", async () => {
    const res = await request(app)
      .post("/api/documents/upload?kind=bogus&filename=x.pdf")
      .set("Content-Type", "application/pdf")
      .send(Buffer.from("x"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/documents/register", () => {
  it("copies a file from an allowed source dir into managed storage and computes a hash", async () => {
    mkdirSync(RESUME_DIR, { recursive: true });
    const sourcePath = join(RESUME_DIR, "Test Resume.pdf");
    writeFileSync(sourcePath, "fake pdf content for hashing");

    const res = await request(app).post("/api/documents/register").send({
      sourcePath,
      kind: "resume",
      label: "Test Resume",
    });

    expect(res.status).toBe(201);
    expect(res.body.storageKey).toBeTruthy();
    expect(res.body.sourcePath).toBe(sourcePath);
  });

  it("rejects a sourcePath outside the allowlisted roots", async () => {
    const res = await request(app).post("/api/documents/register").send({
      sourcePath: "/etc/passwd",
      kind: "resume",
    });
    expect(res.status).toBe(400);
  });

  it("404s when the source file doesn't exist", async () => {
    mkdirSync(RESUME_DIR, { recursive: true });
    const res = await request(app).post("/api/documents/register").send({
      sourcePath: join(RESUME_DIR, "does-not-exist.pdf"),
      kind: "resume",
    });
    expect(res.status).toBe(404);
  });

  it("attaches the registered document to an application when applicationId+attachAs are given", async () => {
    mkdirSync(COVER_LETTER_DIR, { recursive: true });
    const sourcePath = join(COVER_LETTER_DIR, "Test Cover Letter.docx");
    writeFileSync(sourcePath, "fake docx content");

    const posting = await createPosting();
    const application = await createApplication(posting.id);

    const res = await request(app).post("/api/documents/register").send({
      sourcePath,
      kind: "cover_letter",
      applicationId: application.id,
      attachAs: "cover",
    });
    expect(res.status).toBe(201);

    const appRes = await request(app).get("/api/applications");
    const updated = appRes.body.find((a: { id: string }) => a.id === application.id);
    expect(updated.coverDocId).toBe(res.body.id);
  });
});

describe("GET /api/documents/:id/file", () => {
  it("sets content-disposition attachment when ?download=1", async () => {
    mkdirSync(RESUME_DIR, { recursive: true });
    const sourcePath = join(RESUME_DIR, "Download Test.pdf");
    writeFileSync(sourcePath, "content");
    const registered = await request(app).post("/api/documents/register").send({
      sourcePath,
      kind: "resume",
    });

    const inlineRes = await request(app).get(`/api/documents/${registered.body.id}/file`);
    expect(inlineRes.headers["content-disposition"]).toMatch(/^inline/);

    const downloadRes = await request(app).get(`/api/documents/${registered.body.id}/file?download=1`);
    expect(downloadRes.headers["content-disposition"]).toMatch(/^attachment/);
  });

  it("404s with a clear message when the backing file is missing from disk", async () => {
    const doc = await createDocument({ kind: "resume", filePath: "/tmp/does-not-actually-exist.pdf" });
    const res = await request(app).get(`/api/documents/${doc.id}/file`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no longer exists on disk/);
  });
});

describe("GET /api/documents/:id", () => {
  it("returns exists + usedBy", async () => {
    const posting = await createPosting();
    const doc = await createDocument({ kind: "resume" });
    const application = await createApplication(posting.id, { resumeDocId: doc.id });

    const res = await request(app).get(`/api/documents/${doc.id}`);
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(false); // /tmp/resume.pdf default fixture path doesn't exist
    expect(res.body.usedBy).toHaveLength(1);
    expect(res.body.usedBy[0].applicationId).toBe(application.id);
    expect(res.body.usedBy[0].role).toBe("resume");
  });

  it("404s for a missing document", async () => {
    const res = await request(app).get("/api/documents/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/documents/scan", () => {
  it("picks up a new file in the source dirs", async () => {
    mkdirSync(RESUME_DIR, { recursive: true });
    writeFileSync(join(RESUME_DIR, "Scanned Resume.pdf"), "content");

    const res = await request(app).post("/api/documents/scan");
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBeGreaterThanOrEqual(1);

    const listRes = await request(app).get("/api/documents?kind=resume");
    expect(listRes.body.some((d: { label: string }) => d.label === "Scanned Resume")).toBe(true);
  });
});
