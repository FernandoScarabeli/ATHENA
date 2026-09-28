-- AI/LLM is intentionally decoupled from the core product. Preserve the
-- canonical requirements and their manual relations while removing only
-- generated analyses, proposals, and their supporting enum types.
DROP TABLE IF EXISTS "DependencyAnalysisItem";
DROP TABLE IF EXISTS "AiSuggestion";
DROP TABLE IF EXISTS "DependencyAnalysis";
DROP TABLE IF EXISTS "ImpactItem";
DROP TABLE IF EXISTS "ImpactAnalysis";

DROP TYPE IF EXISTS "DependencyAnalysisStatus";
DROP TYPE IF EXISTS "AiSuggestionStatus";
DROP TYPE IF EXISTS "AiSuggestionType";
DROP TYPE IF EXISTS "ImpactDecision";
DROP TYPE IF EXISTS "ImpactStatus";
