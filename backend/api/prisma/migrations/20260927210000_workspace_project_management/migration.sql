ALTER TABLE "Workspace" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "IntegrationProjectMapping" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "GoogleDriveFolderLink" ADD COLUMN "suspendedAt" TIMESTAMP(3);

CREATE INDEX "IntegrationProjectMapping_projectId_suspendedAt_idx"
  ON "IntegrationProjectMapping"("projectId", "suspendedAt");
CREATE INDEX "GoogleDriveFolderLink_projectId_suspendedAt_idx"
  ON "GoogleDriveFolderLink"("projectId", "suspendedAt");
