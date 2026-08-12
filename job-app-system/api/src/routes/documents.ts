import { Router, raw } from "express";
import { createHash } from "crypto";
import { existsSync, mkdirSync, copyFileSync, statSync, writeFileSync, unlinkSync, readFileSync } from "fs";
import { join, resolve, sep, extname, basename } from "path";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import { createDocumentSchema, paginationSchema, registerDocumentSchema } from "../validation.js";
import { RESUME_DIR, COVER_LETTER_DIR, scanDocumentDirs } from "../documentImport.js";

export const documentsRouter = Router();

// api/data/documents/ — sibling of jobs.db. Never committed to git (see repo .gitignore).
// Overridable via env var so tests write into a throwaway temp dir instead — see api/test/setup.ts.
const STORAGE_DIR = process.env.DOCUMENTS_STORAGE_DIR ?? join(import.meta.dirname, "../../data/documents");

// The only roots a `sourcePath`/`register` request is allowed to resolve inside — the same
// Professional/ directories importDocuments.ts already treats as the canonical source-file
// location. Rejecting anything outside this prevents an arbitrary-file-read/copy via a crafted
// sourcePath.
const ALLOWED_ROOTS = [resolve(RESUME_DIR), resolve(COVER_LETTER_DIR)];

function isInsideAllowedRoot(resolvedPath: string): boolean {
  return ALLOWED_ROOTS.some(
    (root) => resolvedPath === root || resolvedPath.startsWith(root + sep)
  );
}

function ensureStorageDir() {
  if (!existsSync(STORAGE_DIR)) mkdirSync(STORAGE_DIR, { recursive: true });
}

function sanitizeBasename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function mimeForExt(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

// Resolves the actual on-disk path for a document: managed storage first (storageKey), falling
// back to the legacy filePath — the latter still passes through the same allowlist guard as
// /register so a legacy row pointing outside Resumes//Cover Letters/ can't be used to read
// arbitrary files via this endpoint.
function resolveDocumentFile(doc: { storageKey: string | null; filePath: string }): string | null {
  if (doc.storageKey) {
    return join(STORAGE_DIR, doc.storageKey);
  }
  const resolved = resolve(doc.filePath);
  if (!isInsideAllowedRoot(resolved)) return null;
  return resolved;
}

documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { kind } = req.query;
    const { take, skip } = paginationSchema.parse(req.query);
    const documents = await prisma.document.findMany({
      where: { kind: kind ? (kind as string) : undefined },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });
    const withExists = documents.map((d) => {
      const path = resolveDocumentFile(d);
      return { ...d, exists: !!path && existsSync(path) };
    });
    res.json(withExists);
  })
);

documentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) throw new HttpError(404, "Document not found");

    const path = resolveDocumentFile(document);
    const exists = !!path && existsSync(path);

    const applications = await prisma.application.findMany({
      where: { OR: [{ resumeDocId: document.id }, { coverDocId: document.id }] },
      include: { posting: true },
    });
    const usedBy = applications.map((a) => ({
      applicationId: a.id,
      role: a.resumeDocId === document.id ? ("resume" as const) : ("cover" as const),
      postingTitle: a.posting.title,
      organization: a.posting.organization,
      stage: a.stage,
    }));

    res.json({ ...document, exists, usedBy });
  })
);

documentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createDocumentSchema.parse(req.body);
    const document = await prisma.document.create({
      data: { ...data, isBaseTemplate: data.isBaseTemplate ?? false },
    });
    res.status(201).json(document);
  })
);

// Real browser upload — raw bytes only, scoped to this one route (not app-wide) so the rest of
// the API keeps its plain express.json() body parsing untouched. kind/label/filename travel as
// query params since the body itself is the file's raw bytes, not JSON.
documentsRouter.post(
  "/upload",
  raw({
    type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    limit: "25mb",
  }),
  asyncHandler(async (req, res) => {
    const kind = req.query.kind === "cover_letter" ? "cover_letter" : req.query.kind === "resume" ? "resume" : null;
    if (!kind) throw new HttpError(400, "kind must be 'resume' or 'cover_letter'");
    const filename = typeof req.query.filename === "string" ? req.query.filename : "upload";
    const label = typeof req.query.label === "string" && req.query.label.trim() ? req.query.label.trim() : basename(filename, extname(filename));

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new HttpError(400, "Request body must be raw file bytes with a matching Content-Type (pdf or docx)");
    }

    const ext = extname(filename) || (req.get("content-type")?.includes("pdf") ? ".pdf" : ".docx");
    ensureStorageDir();

    const document = await prisma.document.create({
      data: {
        kind,
        label,
        filePath: filename,
        isBaseTemplate: false,
        originalFilename: filename,
        mimeType: mimeForExt(ext),
        sizeBytes: req.body.length,
      },
    });

    const storageKey = `${document.id}__${sanitizeBasename(basename(filename, ext))}${ext}`;
    const hash = createHash("sha256").update(req.body).digest("hex");
    writeFileSync(join(STORAGE_DIR, storageKey), req.body);

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: { storageKey, sha256: hash },
    });

    res.status(201).json(updated);
  })
);

// For files that already exist on disk (Resumes//Cover Letters/) — used by the tailor-application
// skill and the Documents page's "Scan" flow when a caller already knows the exact path. Copies
// (never moves) the source file into managed storage.
documentsRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const data = registerDocumentSchema.parse(req.body);

    const resolvedSource = resolve(data.sourcePath);
    if (!isInsideAllowedRoot(resolvedSource)) {
      throw new HttpError(400, "sourcePath must be inside Resumes/ or Cover Letters/");
    }

    let stat;
    try {
      stat = statSync(resolvedSource);
    } catch {
      throw new HttpError(404, "Source file not found");
    }
    if (!stat.isFile()) throw new HttpError(400, "sourcePath is not a file");

    const ext = extname(resolvedSource);
    const originalFilename = basename(resolvedSource);
    const label = data.label ?? basename(resolvedSource, ext);

    ensureStorageDir();

    const document = await prisma.document.create({
      data: {
        kind: data.kind,
        label,
        filePath: data.sourcePath,
        isBaseTemplate: data.isBaseTemplate ?? false,
        originalFilename,
        mimeType: mimeForExt(ext),
        sizeBytes: stat.size,
        sourcePath: data.sourcePath,
      },
    });

    const storageKey = `${document.id}__${sanitizeBasename(basename(originalFilename, ext))}${ext}`;
    const destPath = join(STORAGE_DIR, storageKey);
    copyFileSync(resolvedSource, destPath);
    const hash = createHash("sha256").update(readFileSync(destPath)).digest("hex");

    let updated = await prisma.document.update({
      where: { id: document.id },
      data: { storageKey, sha256: hash },
    });

    if (data.applicationId && data.attachAs) {
      const field = data.attachAs === "resume" ? "resumeDocId" : "coverDocId";
      await prisma.application
        .update({
          where: { id: data.applicationId },
          data: { [field]: document.id },
        })
        .catch(() => {
          // Document row already exists and is servable even if the attach target was bad —
          // report the failure but don't roll back the created document (no orphaned-unattachable
          // state either way since the doc is still usable/attachable manually afterward).
          throw new HttpError(404, "applicationId not found — document was still registered");
        });
    }

    res.status(201).json(updated);
  })
);

documentsRouter.post(
  "/scan",
  asyncHandler(async (_req, res) => {
    const result = await scanDocumentDirs();
    res.json({ inserted: result.inserted.length, skipped: result.skipped, documents: result.inserted });
  })
);

documentsRouter.get(
  "/:id/file",
  asyncHandler(async (req, res) => {
    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) throw new HttpError(404, "Document not found");

    const path = resolveDocumentFile(document);
    if (!path || !existsSync(path)) {
      throw new HttpError(404, "file no longer exists on disk");
    }

    const ext = extname(path);
    res.setHeader("Content-Type", mimeForExt(ext));
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="${sanitizeBasename(basename(path))}"`);
    res.sendFile(path, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: "file no longer exists on disk" });
      }
    });
  })
);

documentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const inUse = await prisma.application.findFirst({
      where: { OR: [{ resumeDocId: req.params.id }, { coverDocId: req.params.id }] },
    });
    if (inUse) throw new HttpError(409, "Document is still assigned to an application");

    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    await prisma.document.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "Document not found");
    });

    if (document?.storageKey) {
      const path = join(STORAGE_DIR, document.storageKey);
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch {
          // best-effort cleanup — the DB row is already gone, a leftover file isn't harmful
        }
      }
    }

    res.status(204).end();
  })
);
