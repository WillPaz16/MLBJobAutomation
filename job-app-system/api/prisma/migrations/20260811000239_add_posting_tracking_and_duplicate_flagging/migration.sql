-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Posting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "url" TEXT NOT NULL,
    "description" TEXT,
    "postedAt" DATETIME,
    "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "missedRuns" INTEGER NOT NULL DEFAULT 0,
    "possibleDuplicateOfId" TEXT,
    "duplicateRejected" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Posting_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Posting_possibleDuplicateOfId_fkey" FOREIGN KEY ("possibleDuplicateOfId") REFERENCES "Posting" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Posting" ("category", "description", "discoveredAt", "externalId", "id", "location", "organization", "postedAt", "sourceId", "title", "url") SELECT "category", "description", "discoveredAt", "externalId", "id", "location", "organization", "postedAt", "sourceId", "title", "url" FROM "Posting";
DROP TABLE "Posting";
ALTER TABLE "new_Posting" RENAME TO "Posting";
CREATE UNIQUE INDEX "Posting_sourceId_externalId_key" ON "Posting"("sourceId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
