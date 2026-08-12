-- CreateTable
CREATE TABLE "ApplicationStageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'api',
    CONSTRAINT "ApplicationStageEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ApplicationStageEvent_applicationId_createdAt_idx" ON "ApplicationStageEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "ApplicationStageEvent_toStage_createdAt_idx" ON "ApplicationStageEvent"("toStage", "createdAt");
