-- ATH-017: logical workspace connections retain source/candidate history.
CREATE TYPE "IntegrationKind" AS ENUM ('GITHUB', 'GOOGLE');
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED');
CREATE TYPE "IntegrationCandidateStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

CREATE TABLE "IntegrationConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" "IntegrationKind" NOT NULL,
  "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "accountLabel" TEXT,
  "encryptedCredentials" TEXT,
  "connectedAt" TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "IntegrationSource" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationSource_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "IntegrationCandidate" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "sourceId" TEXT,
  "externalId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "status" "IntegrationCandidateStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationCandidate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationConnection_workspaceId_kind_key" ON "IntegrationConnection"("workspaceId", "kind");
CREATE INDEX "IntegrationConnection_workspaceId_status_idx" ON "IntegrationConnection"("workspaceId", "status");
CREATE UNIQUE INDEX "IntegrationSource_connectionId_externalId_key" ON "IntegrationSource"("connectionId", "externalId");
CREATE INDEX "IntegrationSource_connectionId_capturedAt_idx" ON "IntegrationSource"("connectionId", "capturedAt");
CREATE UNIQUE INDEX "IntegrationCandidate_connectionId_externalId_key" ON "IntegrationCandidate"("connectionId", "externalId");
CREATE INDEX "IntegrationCandidate_connectionId_status_idx" ON "IntegrationCandidate"("connectionId", "status");
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationSource" ADD CONSTRAINT "IntegrationSource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationCandidate" ADD CONSTRAINT "IntegrationCandidate_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationCandidate" ADD CONSTRAINT "IntegrationCandidate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
