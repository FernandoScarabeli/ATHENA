CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "RequirementEmbeddingChunk" (
  "id" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "embedding" vector(768) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequirementEmbeddingChunk_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequirementEmbeddingChunk_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "RequirementEmbeddingChunk_requirementId_ordinal_embeddingModel_key"
  ON "RequirementEmbeddingChunk"("requirementId", "ordinal", "embeddingModel");
CREATE INDEX "RequirementEmbeddingChunk_requirementId_embeddingModel_idx"
  ON "RequirementEmbeddingChunk"("requirementId", "embeddingModel");
CREATE INDEX "RequirementEmbeddingChunk_embedding_hnsw_idx"
  ON "RequirementEmbeddingChunk" USING hnsw ("embedding" vector_cosine_ops);
