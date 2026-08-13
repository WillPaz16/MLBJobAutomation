-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "isBaseTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storageKey" TEXT,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sourcePath" TEXT
);
INSERT INTO "new_Document" ("createdAt", "filePath", "id", "isBaseTemplate", "kind", "label", "mimeType", "originalFilename", "sizeBytes", "sourcePath", "storageKey") SELECT "createdAt", "filePath", "id", "isBaseTemplate", "kind", "label", "mimeType", "originalFilename", "sizeBytes", "sourcePath", "storageKey" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE TABLE "new_Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Source" ("createdAt", "id", "name", "type") SELECT "createdAt", "id", "name", "type" FROM "Source";
DROP TABLE "Source";
ALTER TABLE "new_Source" RENAME TO "Source";
CREATE UNIQUE INDEX "Source_name_key" ON "Source"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

