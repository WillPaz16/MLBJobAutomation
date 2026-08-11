-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'profile',
    "skills" TEXT NOT NULL,
    "preferredCategories" TEXT,
    "locationKeywords" TEXT,
    "excludeKeywords" TEXT,
    "updatedAt" DATETIME NOT NULL
);
