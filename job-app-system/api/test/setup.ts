import { execSync } from "child_process";
import { existsSync, unlinkSync, mkdtempSync, rmSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { afterAll, afterEach, beforeAll } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Relative sqlite DATABASE_URL values resolve relative to prisma/schema.prisma's
// directory, not cwd — same quirk documented in CLAUDE.md for the main db file.
const TEST_DB_PATH = join(__dirname, "../prisma/test.db");

// Must be set before any module imports @prisma/client — Prisma reads DATABASE_URL
// at PrismaClient construction time, and this file's imports run before any test
// file's imports thanks to Vitest's setupFiles ordering.
process.env.DATABASE_URL = "file:./test.db";
process.env.NODE_ENV = "test";

// Managed-document storage + the Resumes/Cover Letters scan dirs all point at throwaway temp
// directories for the whole test run — never the real Professional/Resumes,
// Professional/Cover Letters, or api/data/documents. Same DATABASE_URL-style must-be-set-before-
// import requirement applies (documentImport.ts and routes/documents.ts read these at module load).
const TEST_TMP_ROOT = mkdtempSync(join(tmpdir(), "job-app-docs-test-"));
process.env.DOCS_RESUME_DIR = join(TEST_TMP_ROOT, "Resumes");
process.env.DOCS_COVER_LETTER_DIR = join(TEST_TMP_ROOT, "Cover Letters");
process.env.DOCUMENTS_STORAGE_DIR = join(TEST_TMP_ROOT, "documents-storage");

beforeAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  execSync("npx prisma migrate deploy", {
    cwd: join(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
});

afterEach(async () => {
  const { prisma } = await import("../src/db.js");
  // FK ordering: ApplicationStageEvent rows reference Application, so they must go first.
  await prisma.applicationStageEvent.deleteMany();
  await prisma.application.deleteMany();
  await prisma.document.deleteMany();
  await prisma.posting.deleteMany();
  await prisma.source.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.resumeBullet.deleteMany();
  await prisma.orgProfile.deleteMany();
  await prisma.tonePreset.deleteMany();
  await prisma.candidateProfile.deleteMany();
  await prisma.savedSearch.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("../src/db.js");
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  rmSync(TEST_TMP_ROOT, { recursive: true, force: true });
});
