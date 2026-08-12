import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// 14 concurrent scraper runners can all hit this one SQLite file; without a busy timeout a
// writer that finds the db locked fails immediately with SQLITE_BUSY instead of waiting.
// $queryRawUnsafe (not $executeRawUnsafe) because SQLite's PRAGMA statement returns a result
// row, which Prisma's $executeRaw rejects ("Execute returned results, which is not allowed in
// SQLite"); not a parameterized query because PRAGMA statements don't accept bind params.
await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
