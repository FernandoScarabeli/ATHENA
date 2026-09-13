-- Bidirectional Google Drive synchronization. Existing links remain readable
-- until an OWNER selects their destination project.
CREATE TYPE "GoogleSyncStatus" AS ENUM ('IDLE', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "GoogleDriveOutboxOperation" AS ENUM ('CREATE', 'UPDATE', 'MOVE', 'ARCHIVE');
CREATE TYPE "GoogleDriveOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "RequirementFolder" ADD COLUMN "parentId" TEXT;
ALTER TABLE "RequirementFolder" DROP CONSTRAINT "RequirementFolder_workspaceId_name_key";
DROP INDEX "RequirementFolder_workspaceId_lower_name_key";
ALTER TABLE "RequirementFolder" ADD CONSTRAINT "RequirementFolder_workspaceId_parentId_name_key" UNIQUE ("workspaceId", "parentId", "name");
CREATE UNIQUE INDEX "RequirementFolder_workspaceId_parentId_lower_name_key" ON "RequirementFolder" ("workspaceId", "parentId", LOWER("name"));
ALTER TABLE "RequirementFolder" ADD CONSTRAINT "RequirementFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RequirementFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "RequirementFolder_workspaceId_parentId_name_idx" ON "RequirementFolder"("workspaceId", "parentId", "name");

ALTER TABLE "GoogleDriveFolderLink" ADD COLUMN "projectId" TEXT;
ALTER TABLE "GoogleDriveFolderLink" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "GoogleDriveFolderLink" ADD COLUMN "syncStartedAt" TIMESTAMP(3);
ALTER TABLE "GoogleDriveFolderLink" ADD COLUMN "syncStatus" "GoogleSyncStatus" NOT NULL DEFAULT 'IDLE';
ALTER TABLE "GoogleDriveFolderLink" ADD COLUMN "syncError" TEXT;
ALTER TABLE "GoogleDriveFolderLink" ADD CONSTRAINT "GoogleDriveFolderLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "GoogleDriveFolderLink_projectId_syncStatus_idx" ON "GoogleDriveFolderLink"("projectId", "syncStatus");

ALTER TABLE "IntegrationSource" ADD COLUMN "canonicalRequirementId" TEXT;
ALTER TABLE "IntegrationSource" ADD COLUMN "lastRemoteFingerprint" TEXT;
ALTER TABLE "IntegrationSource" ADD COLUMN "lastPushedFingerprint" TEXT;
ALTER TABLE "IntegrationSource" ADD COLUMN "lastRemoteModifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "IntegrationSource_canonicalRequirementId_key" ON "IntegrationSource"("canonicalRequirementId");
ALTER TABLE "IntegrationSource" ADD CONSTRAINT "IntegrationSource_canonicalRequirementId_fkey" FOREIGN KEY ("canonicalRequirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GoogleDriveFolderMapping" (
  "id" TEXT NOT NULL,
  "googleDriveFolderLinkId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "parentExternalId" TEXT,
  "name" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleDriveFolderMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleDriveFolderMapping_googleDriveFolderLinkId_externalId_key" ON "GoogleDriveFolderMapping"("googleDriveFolderLinkId", "externalId");
CREATE UNIQUE INDEX "GoogleDriveFolderMapping_folderId_key" ON "GoogleDriveFolderMapping"("folderId");
CREATE INDEX "GoogleDriveFolderMapping_googleDriveFolderLinkId_parentExternalId_idx" ON "GoogleDriveFolderMapping"("googleDriveFolderLinkId", "parentExternalId");
ALTER TABLE "GoogleDriveFolderMapping" ADD CONSTRAINT "GoogleDriveFolderMapping_googleDriveFolderLinkId_fkey" FOREIGN KEY ("googleDriveFolderLinkId") REFERENCES "GoogleDriveFolderLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleDriveFolderMapping" ADD CONSTRAINT "GoogleDriveFolderMapping_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "RequirementFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GoogleDriveOutbox" (
  "id" TEXT NOT NULL,
  "googleDriveFolderLinkId" TEXT NOT NULL,
  "integrationSourceId" TEXT,
  "requirementId" TEXT NOT NULL,
  "operation" "GoogleDriveOutboxOperation" NOT NULL,
  "status" "GoogleDriveOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleDriveOutbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GoogleDriveOutbox_status_availableAt_idx" ON "GoogleDriveOutbox"("status", "availableAt");
CREATE INDEX "GoogleDriveOutbox_googleDriveFolderLinkId_status_idx" ON "GoogleDriveOutbox"("googleDriveFolderLinkId", "status");
ALTER TABLE "GoogleDriveOutbox" ADD CONSTRAINT "GoogleDriveOutbox_googleDriveFolderLinkId_fkey" FOREIGN KEY ("googleDriveFolderLinkId") REFERENCES "GoogleDriveFolderLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoogleDriveOutbox" ADD CONSTRAINT "GoogleDriveOutbox_integrationSourceId_fkey" FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoogleDriveOutbox" ADD CONSTRAINT "GoogleDriveOutbox_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
