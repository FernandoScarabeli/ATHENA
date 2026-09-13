-- RELATED_TO is symmetric. Keep the directed representation used by the API,
-- but prevent the same unordered pair from being inserted in reverse order.
-- This is partial so directional relation types keep their explicit direction.
CREATE UNIQUE INDEX "RequirementRelation_related_to_unordered_pair_key"
ON "RequirementRelation" (LEAST("sourceId", "targetId"), GREATEST("sourceId", "targetId"), "type")
WHERE "type" = 'RELATED_TO';
