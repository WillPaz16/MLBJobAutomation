-- CreateIndex
CREATE INDEX "Posting_organization_idx" ON "Posting"("organization");

-- CreateIndex
CREATE INDEX "Posting_sourceId_organization_closedAt_idx" ON "Posting"("sourceId", "organization", "closedAt");
