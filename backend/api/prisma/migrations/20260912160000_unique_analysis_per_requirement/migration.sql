-- Do not silently discard historical analyses. Reconcile duplicates first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ImpactAnalysis" GROUP BY "requirementId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'ATH-014: duplicate ImpactAnalysis rows exist; reconcile them before creating the unique index';
  END IF;
END $$;

-- One analysis row is reused for retries, preventing duplicate suggestions.
CREATE UNIQUE INDEX "ImpactAnalysis_requirementId_key" ON "ImpactAnalysis"("requirementId");
