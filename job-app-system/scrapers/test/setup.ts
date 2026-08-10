import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mockServer.js";

process.env.DATABASE_URL = "file:./test.db";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(async () => {
  server.resetHandlers();
  const { prisma } = await import("../src/db.js");
  await prisma.posting.deleteMany();
  await prisma.source.deleteMany();
});

afterAll(async () => {
  server.close();
  const { prisma } = await import("../src/db.js");
  await prisma.$disconnect();
});
