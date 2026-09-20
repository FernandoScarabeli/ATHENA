-- Durable sync executions back the paginated integration audit UI.
CREATE TABLE "GoogleDriveSyncRun" (
  "id" TEXT NOT NULL,
  "googleDriveFolderLinkId" TEXT NOT NULL,
  "status" "GoogleSyncStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "scannedCount" INTEGER NOT NULL DEFAULT 0,
  "changedCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  CONSTRAINT "GoogleDriveSyncRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GoogleDriveSyncRun_googleDriveFolderLinkId_startedAt_idx" ON "GoogleDriveSyncRun"("googleDriveFolderLinkId", "startedAt");
ALTER TABLE "GoogleDriveSyncRun" ADD CONSTRAINT "GoogleDriveSyncRun_googleDriveFolderLinkId_fkey" FOREIGN KEY ("googleDriveFolderLinkId") REFERENCES "GoogleDriveFolderLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GoogleDriveSyncRunItem" (
  "id" TEXT NOT NULL,
  "googleDriveSyncRunId" TEXT NOT NULL,
  "candidateId" TEXT,
  "sourceId" TEXT,
  "externalId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "changeType" "IntegrationCandidateChangeType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleDriveSyncRunItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleDriveSyncRunItem_googleDriveSyncRunId_externalId_key" ON "GoogleDriveSyncRunItem"("googleDriveSyncRunId", "externalId");
CREATE INDEX "GoogleDriveSyncRunItem_googleDriveSyncRunId_createdAt_idx" ON "GoogleDriveSyncRunItem"("googleDriveSyncRunId", "createdAt");
ALTER TABLE "GoogleDriveSyncRunItem" ADD CONSTRAINT "GoogleDriveSyncRunItem_googleDriveSyncRunId_fkey" FOREIGN KEY ("googleDriveSyncRunId") REFERENCES "GoogleDriveSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleDriveSyncRunItem" ADD CONSTRAINT "GoogleDriveSyncRunItem_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "IntegrationCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoogleDriveSyncRunItem" ADD CONSTRAINT "GoogleDriveSyncRunItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Older installations only retained the latest link status and candidate
-- audit. Consolidate that material into one initial execution per linked
-- folder so the new accordion does not begin empty after deployment.
INSERT INTO "GoogleDriveSyncRun" ("id", "googleDriveFolderLinkId", "status", "startedAt", "completedAt", "scannedCount", "changedCount")
SELECT md5('legacy-sync:' || link."id"), link."id", 'COMPLETED', COALESCE(link."lastSyncedAt", link."updatedAt"), COALESCE(link."lastSyncedAt", link."updatedAt"), COUNT(candidate."id"), COUNT(candidate."id")
FROM "GoogleDriveFolderLink" AS link
LEFT JOIN "IntegrationSource" AS source ON source."googleDriveFolderLinkId" = link."id"
LEFT JOIN "IntegrationCandidate" AS candidate ON candidate."sourceId" = source."id"
GROUP BY link."id", link."lastSyncedAt", link."updatedAt";

INSERT INTO "GoogleDriveSyncRunItem" ("id", "googleDriveSyncRunId", "candidateId", "sourceId", "externalId", "title", "changeType", "createdAt")
SELECT md5('legacy-sync-item:' || candidate."id"), md5('legacy-sync:' || link."id"), candidate."id", source."id", candidate."externalId", candidate."title", candidate."changeType", candidate."updatedAt"
FROM "GoogleDriveFolderLink" AS link
JOIN "IntegrationSource" AS source ON source."googleDriveFolderLinkId" = link."id"
JOIN "IntegrationCandidate" AS candidate ON candidate."sourceId" = source."id";
