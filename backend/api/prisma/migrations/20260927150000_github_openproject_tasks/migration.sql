ALTER TYPE "IntegrationKind" ADD VALUE 'OPENPROJECT';

CREATE TYPE "IntegrationTaskOperationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'UNKNOWN');

CREATE TABLE "IntegrationProjectMapping" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "resourceKind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalName" TEXT NOT NULL,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationProjectMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationTaskOperation" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "status" "IntegrationTaskOperationStatus" NOT NULL DEFAULT 'PENDING',
    "action" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "remoteType" TEXT,
    "remoteId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationTaskOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalArtifactLink" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "remoteType" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "remoteStatus" TEXT,
    "remoteMetadata" JSONB,
    "remoteUpdatedAt" TIMESTAMP(3),
    "snapshotRevision" INTEGER,
    "linkedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExternalArtifactLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationProjectMapping_projectId_connectionId_resourceKind_externalId_key" ON "IntegrationProjectMapping"("projectId", "connectionId", "resourceKind", "externalId");
CREATE INDEX "IntegrationProjectMapping_connectionId_resourceKind_idx" ON "IntegrationProjectMapping"("connectionId", "resourceKind");
CREATE INDEX "IntegrationProjectMapping_projectId_resourceKind_idx" ON "IntegrationProjectMapping"("projectId", "resourceKind");
CREATE UNIQUE INDEX "IntegrationTaskOperation_idempotencyKey_key" ON "IntegrationTaskOperation"("idempotencyKey");
CREATE INDEX "IntegrationTaskOperation_requirementId_createdAt_idx" ON "IntegrationTaskOperation"("requirementId", "createdAt");
CREATE INDEX "IntegrationTaskOperation_connectionId_status_idx" ON "IntegrationTaskOperation"("connectionId", "status");
CREATE UNIQUE INDEX "ExternalArtifactLink_connectionId_remoteType_remoteId_key" ON "ExternalArtifactLink"("connectionId", "remoteType", "remoteId");
CREATE INDEX "ExternalArtifactLink_requirementId_createdAt_idx" ON "ExternalArtifactLink"("requirementId", "createdAt");

ALTER TABLE "IntegrationProjectMapping" ADD CONSTRAINT "IntegrationProjectMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationProjectMapping" ADD CONSTRAINT "IntegrationProjectMapping_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationTaskOperation" ADD CONSTRAINT "IntegrationTaskOperation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationTaskOperation" ADD CONSTRAINT "IntegrationTaskOperation_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalArtifactLink" ADD CONSTRAINT "ExternalArtifactLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalArtifactLink" ADD CONSTRAINT "ExternalArtifactLink_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
