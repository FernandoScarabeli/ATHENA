-- Folder names are unique for users regardless of letter casing.
-- Keep the Prisma compound unique constraint as well for schema compatibility;
-- this functional index closes the concurrent case-insensitive insert race.
CREATE UNIQUE INDEX "RequirementFolder_workspaceId_lower_name_key"
ON "RequirementFolder" ("workspaceId", LOWER("name"));
