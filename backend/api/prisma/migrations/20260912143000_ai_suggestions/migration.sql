-- ATH-013: AI proposals are additive. ImpactAnalysis/ImpactItem are retained
-- unchanged so existing completed and failed analyses remain readable.
CREATE TYPE "AiSuggestionType" AS ENUM ('RELATION','REFERENCE');
CREATE TYPE "AiSuggestionStatus" AS ENUM ('PENDING','CONFIRMED','DISMISSED');

CREATE TABLE "AiSuggestion" (
  "id" TEXT PRIMARY KEY,
  "analysisId" TEXT NOT NULL REFERENCES "ImpactAnalysis"("id") ON DELETE CASCADE,
  "requirementId" TEXT NOT NULL REFERENCES "Requirement"("id") ON DELETE CASCADE,
  "type" "AiSuggestionType" NOT NULL,
  "targetRequirementId" TEXT REFERENCES "Requirement"("id") ON DELETE CASCADE,
  "relationType" "RelationType",
  "referenceType" "ReferenceType",
  "url" TEXT,
  "confidence" DOUBLE PRECISION,
  "justification" TEXT NOT NULL,
  "status" "AiSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "AiSuggestion_analysisId_status_idx" ON "AiSuggestion" ("analysisId","status");
CREATE INDEX "AiSuggestion_requirementId_status_idx" ON "AiSuggestion" ("requirementId","status");
CREATE INDEX "AiSuggestion_targetRequirementId_idx" ON "AiSuggestion" ("targetRequirementId");
