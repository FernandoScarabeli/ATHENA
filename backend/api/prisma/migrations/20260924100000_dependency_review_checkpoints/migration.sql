ALTER TABLE "AiSuggestion" ADD COLUMN "evidence" JSONB;

CREATE UNIQUE INDEX "AiSuggestion_dependencyAnalysisId_requirementId_targetRequirementId_key"
ON "AiSuggestion"("dependencyAnalysisId", "requirementId", "targetRequirementId");

CREATE TABLE "DependencyAnalysisItem" (
  "id" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "sourceRequirementId" TEXT NOT NULL,
  "result" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DependencyAnalysisItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DependencyAnalysisItem_analysisId_sourceRequirementId_key"
ON "DependencyAnalysisItem"("analysisId", "sourceRequirementId");
CREATE INDEX "DependencyAnalysisItem_analysisId_completedAt_idx"
ON "DependencyAnalysisItem"("analysisId", "completedAt");

ALTER TABLE "DependencyAnalysisItem"
ADD CONSTRAINT "DependencyAnalysisItem_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "DependencyAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DependencyAnalysisItem"
ADD CONSTRAINT "DependencyAnalysisItem_sourceRequirementId_fkey"
FOREIGN KEY ("sourceRequirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
