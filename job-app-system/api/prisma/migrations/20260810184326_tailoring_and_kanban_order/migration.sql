-- CreateTable
CREATE TABLE "ResumeBullet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tags" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "TonePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "guidance" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "OrgProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationName" TEXT NOT NULL,
    "notes" TEXT,
    "preferredToneId" TEXT,
    CONSTRAINT "OrgProfile_preferredToneId_fkey" FOREIGN KEY ("preferredToneId") REFERENCES "TonePreset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postingId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'FOUND',
    "order" INTEGER NOT NULL DEFAULT 0,
    "resumeDocId" TEXT,
    "coverDocId" TEXT,
    "notes" TEXT,
    "appliedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Application_resumeDocId_fkey" FOREIGN KEY ("resumeDocId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Application_coverDocId_fkey" FOREIGN KEY ("coverDocId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("appliedAt", "coverDocId", "createdAt", "id", "notes", "postingId", "resumeDocId", "stage", "updatedAt") SELECT "appliedAt", "coverDocId", "createdAt", "id", "notes", "postingId", "resumeDocId", "stage", "updatedAt" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "isBaseTemplate" BOOLEAN NOT NULL DEFAULT false,
    "generatedFromBulletIds" TEXT,
    "toneId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_toneId_fkey" FOREIGN KEY ("toneId") REFERENCES "TonePreset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("createdAt", "filePath", "id", "isBaseTemplate", "kind", "label") SELECT "createdAt", "filePath", "id", "isBaseTemplate", "kind", "label" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TonePreset_name_key" ON "TonePreset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OrgProfile_organizationName_key" ON "OrgProfile"("organizationName");
