import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
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
  await prisma.application.deleteMany();
  await prisma.document.deleteMany();
  await prisma.posting.deleteMany();
  await prisma.source.deleteMany();
  await prisma.notificationLog.deleteMany();
});

afterAll(async () => {
  const { prisma } = await import("../src/db.js");
  await prisma.$disconnect();
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});
