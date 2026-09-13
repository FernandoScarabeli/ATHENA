CREATE TYPE "IntegrationCandidateChangeType" AS ENUM ('CREATED', 'UPDATED', 'REMOVED');

ALTER TABLE "IntegrationSource"
  ADD COLUMN "externalVersion" TEXT,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "removedAt" TIMESTAMP(3);

ALTER TABLE "IntegrationCandidate"
  ADD COLUMN "externalVersion" TEXT,
  ADD COLUMN "fingerprint" TEXT,
  ADD COLUMN "changeType" "IntegrationCandidateChangeType" NOT NULL DEFAULT 'CREATED',
  ADD COLUMN "previousTitle" TEXT,
  ADD COLUMN "previousContent" JSONB,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE TABLE "IntegrationCandidateRevision" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "externalVersion" TEXT,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationCandidateRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationCandidateRevision_candidateId_fingerprint_key" ON "IntegrationCandidateRevision"("candidateId", "fingerprint");
CREATE INDEX "IntegrationCandidateRevision_candidateId_capturedAt_idx" ON "IntegrationCandidateRevision"("candidateId", "capturedAt");
ALTER TABLE "IntegrationCandidateRevision" ADD CONSTRAINT "IntegrationCandidateRevision_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "IntegrationCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
