CREATE TABLE "GoogleDriveFolderLink" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GoogleDriveFolderLink_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "IntegrationSource" ADD COLUMN "googleDriveFolderLinkId" TEXT;
CREATE UNIQUE INDEX "GoogleDriveFolderLink_connectionId_externalId_key" ON "GoogleDriveFolderLink"("connectionId", "externalId");
CREATE INDEX "GoogleDriveFolderLink_connectionId_updatedAt_idx" ON "GoogleDriveFolderLink"("connectionId", "updatedAt");
CREATE INDEX "IntegrationSource_googleDriveFolderLinkId_removedAt_idx" ON "IntegrationSource"("googleDriveFolderLinkId", "removedAt");
ALTER TABLE "GoogleDriveFolderLink" ADD CONSTRAINT "GoogleDriveFolderLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationSource" ADD CONSTRAINT "IntegrationSource_googleDriveFolderLinkId_fkey" FOREIGN KEY ("googleDriveFolderLinkId") REFERENCES "GoogleDriveFolderLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
