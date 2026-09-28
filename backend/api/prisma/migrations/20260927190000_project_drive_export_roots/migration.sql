ALTER TYPE "GoogleDriveOutboxOperation" ADD VALUE 'CREATE_FOLDER';
ALTER TYPE "GoogleDriveOutboxOperation" ADD VALUE 'UPDATE_FOLDER';
ALTER TYPE "GoogleDriveOutboxOperation" ADD VALUE 'MOVE_FOLDER';
ALTER TYPE "GoogleDriveOutboxOperation" ADD VALUE 'DELETE_FOLDER';

ALTER TABLE "RequirementFolder" ADD COLUMN "projectId" TEXT;
ALTER TABLE "RequirementFolder" ADD CONSTRAINT "RequirementFolder_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequirementFolder" DROP CONSTRAINT "RequirementFolder_workspaceId_parentId_name_key";
DROP INDEX "RequirementFolder_workspaceId_parentId_lower_name_key";

ALTER TABLE "GoogleDriveFolderLink" ADD COLUMN "isExportRoot" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "GoogleDriveOutbox" ADD COLUMN "folderId" TEXT;
ALTER TABLE "GoogleDriveOutbox" ALTER COLUMN "requirementId" DROP NOT NULL;
ALTER TABLE "GoogleDriveOutbox" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "GoogleDriveOutbox" ADD CONSTRAINT "GoogleDriveOutbox_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "RequirementFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "GoogleDriveOutbox_idempotencyKey_key" ON "GoogleDriveOutbox"("idempotencyKey");
CREATE INDEX "GoogleDriveOutbox_folderId_status_idx" ON "GoogleDriveOutbox"("folderId", "status");

DROP INDEX "GoogleDriveFolderMapping_folderId_key";
CREATE INDEX "GoogleDriveFolderMapping_folderId_idx" ON "GoogleDriveFolderMapping"("folderId");

CREATE TEMP TABLE "_RequirementFolderProjectCopy" (
  "oldId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "newId" TEXT NOT NULL,
  PRIMARY KEY ("oldId", "projectId")
);

INSERT INTO "_RequirementFolderProjectCopy" ("oldId", "projectId", "newId")
SELECT folder."id", project."id", gen_random_uuid()::TEXT
FROM "RequirementFolder" folder
JOIN "Project" project ON project."workspaceId" = folder."workspaceId"
WHERE folder."projectId" IS NULL;

-- Old links can predate project selection. When every canonical document in
-- a link belongs to one project, retain that association automatically.
UPDATE "GoogleDriveFolderLink" link
SET "projectId" = source_projects."projectId"
FROM (
  SELECT source."googleDriveFolderLinkId", MIN(requirement."projectId") AS "projectId"
  FROM "IntegrationSource" source
  JOIN "Requirement" requirement ON requirement."id" = source."canonicalRequirementId"
  WHERE source."googleDriveFolderLinkId" IS NOT NULL
  GROUP BY source."googleDriveFolderLinkId"
  HAVING COUNT(DISTINCT requirement."projectId") = 1
) source_projects
WHERE link."id" = source_projects."googleDriveFolderLinkId" AND link."projectId" IS NULL;

DO $$
DECLARE
  project_row RECORD;
  folder_depth INTEGER;
  max_depth INTEGER;
BEGIN
  FOR project_row IN SELECT "id", "workspaceId" FROM "Project" LOOP
    WITH RECURSIVE tree AS (
      SELECT id, "workspaceId", "parentId", 0 AS depth
      FROM "RequirementFolder"
      WHERE "workspaceId" = project_row."workspaceId" AND "parentId" IS NULL AND "projectId" IS NULL
      UNION ALL
      SELECT child.id, child."workspaceId", child."parentId", tree.depth + 1
      FROM "RequirementFolder" child JOIN tree ON child."parentId" = tree.id
      WHERE child."projectId" IS NULL
    ) SELECT COALESCE(MAX(depth), 0) INTO max_depth FROM tree;

    FOR folder_depth IN 0..max_depth LOOP
      WITH RECURSIVE tree AS (
        SELECT folder.id, folder."workspaceId", folder."parentId", 0 AS depth
        FROM "RequirementFolder" folder
        WHERE folder."workspaceId" = project_row."workspaceId" AND folder."parentId" IS NULL AND folder."projectId" IS NULL
        UNION ALL
        SELECT child.id, child."workspaceId", child."parentId", tree.depth + 1
        FROM "RequirementFolder" child JOIN tree ON child."parentId" = tree.id
        WHERE child."projectId" IS NULL
      )
      INSERT INTO "RequirementFolder" (
        "id", "workspaceId", "projectId", "name", "description", "parentId", "createdAt", "updatedAt"
      )
      SELECT copy."newId", folder."workspaceId", project_row."id", folder."name", folder."description",
        parent_copy."newId", folder."createdAt", folder."updatedAt"
      FROM tree
      JOIN "RequirementFolder" folder ON folder."id" = tree.id
      JOIN "_RequirementFolderProjectCopy" copy ON copy."oldId" = folder."id" AND copy."projectId" = project_row."id"
      LEFT JOIN "_RequirementFolderProjectCopy" parent_copy ON parent_copy."oldId" = folder."parentId" AND parent_copy."projectId" = project_row."id"
      WHERE tree.depth = folder_depth;
    END LOOP;
  END LOOP;
END $$;

UPDATE "Requirement" requirement
SET "folderId" = copy."newId"
FROM "_RequirementFolderProjectCopy" copy
WHERE requirement."folderId" = copy."oldId" AND requirement."projectId" = copy."projectId";

UPDATE "GoogleDriveFolderMapping" mapping
SET "folderId" = copy."newId"
FROM "GoogleDriveFolderLink" link
JOIN "_RequirementFolderProjectCopy" copy ON copy."projectId" = link."projectId"
WHERE mapping."googleDriveFolderLinkId" = link."id" AND mapping."folderId" = copy."oldId";

INSERT INTO "RequirementFolder" ("id", "workspaceId", "projectId", "name", "description", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, project."workspaceId", project."id", 'Sem pasta', 'Requisitos ainda não classificados', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Project" project
WHERE NOT EXISTS (
  SELECT 1 FROM "RequirementFolder" folder
  WHERE folder."projectId" = project."id" AND lower(folder."name") = lower('Sem pasta') AND folder."parentId" IS NULL
);

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  LOOP
    DELETE FROM "RequirementFolder" folder
    WHERE folder."projectId" IS NULL
      AND EXISTS (SELECT 1 FROM "Project" project WHERE project."workspaceId" = folder."workspaceId")
      AND NOT EXISTS (SELECT 1 FROM "RequirementFolder" child WHERE child."parentId" = folder."id");
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    EXIT WHEN deleted_count = 0;
  END LOOP;
END $$;

DROP TABLE "_RequirementFolderProjectCopy";

CREATE UNIQUE INDEX "RequirementFolder_projectId_parentId_lower_name_key"
  ON "RequirementFolder" ("projectId", COALESCE("parentId", ''), lower("name")) WHERE "projectId" IS NOT NULL;
CREATE UNIQUE INDEX "RequirementFolder_workspaceId_parentId_lower_name_key"
  ON "RequirementFolder" ("workspaceId", COALESCE("parentId", ''), lower("name")) WHERE "projectId" IS NULL;
CREATE INDEX "RequirementFolder_projectId_parentId_name_idx" ON "RequirementFolder"("projectId", "parentId", "name");
CREATE INDEX "RequirementFolder_workspaceId_projectId_idx" ON "RequirementFolder"("workspaceId", "projectId");
CREATE UNIQUE INDEX "GoogleDriveFolderLink_one_export_root_per_project_key"
  ON "GoogleDriveFolderLink"("projectId") WHERE "projectId" IS NOT NULL AND "isExportRoot" = TRUE;
CREATE INDEX "GoogleDriveFolderLink_projectId_isExportRoot_idx" ON "GoogleDriveFolderLink"("projectId", "isExportRoot");

WITH ranked_links AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt", id) AS position
  FROM "GoogleDriveFolderLink"
  WHERE "projectId" IS NOT NULL
)
UPDATE "GoogleDriveFolderLink" link
SET "isExportRoot" = TRUE
FROM ranked_links
WHERE ranked_links.id = link.id AND ranked_links.position = 1;
