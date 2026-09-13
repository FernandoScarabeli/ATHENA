CREATE TYPE "DependencyAnalysisStatus" AS ENUM ('QUEUED', 'READING', 'PERSISTING', 'COMPLETED', 'FAILED');

CREATE TABLE "DependencyAnalysis" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "status" "DependencyAnalysisStatus" NOT NULL DEFAULT 'QUEUED',
  "totalRequirements" INTEGER NOT NULL DEFAULT 0,
  "processedRequirements" INTEGER NOT NULL DEFAULT 0,
  "suggestionsFound" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DependencyAnalysis_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "DependencyAnalysis" ADD CONSTRAINT "DependencyAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSuggestion" ALTER COLUMN "analysisId" DROP NOT NULL;
ALTER TABLE "AiSuggestion" ADD COLUMN "dependencyAnalysisId" TEXT;
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_dependencyAnalysisId_fkey" FOREIGN KEY ("dependencyAnalysisId") REFERENCES "DependencyAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "DependencyAnalysis_projectId_createdAt_idx" ON "DependencyAnalysis"("projectId", "createdAt");
CREATE INDEX "DependencyAnalysis_projectId_status_idx" ON "DependencyAnalysis"("projectId", "status");
CREATE INDEX "AiSuggestion_dependencyAnalysisId_status_idx" ON "AiSuggestion"("dependencyAnalysisId", "status");
