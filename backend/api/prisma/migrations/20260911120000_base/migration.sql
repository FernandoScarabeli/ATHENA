-- ATHENA baseline: intentionally for a new PostgreSQL/pgvector database only.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TYPE "RequirementType" AS ENUM ('USER_STORY');
CREATE TYPE "RequirementStatus" AS ENUM ('DRAFT','ACTIVE','ARCHIVED');
CREATE TYPE "RelationType" AS ENUM ('RELATED_TO','DEPENDS_ON','BLOCKS','CONFLICTS_WITH');
CREATE TYPE "ImpactStatus" AS ENUM ('PENDING','COMPLETED','FAILED');
CREATE TYPE "ImpactDecision" AS ENUM ('PENDING','CONFIRMED','DISMISSED');
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER','EDITOR','VIEWER');
CREATE TYPE "ReferenceType" AS ENUM ('PROTOTYPE','ATTACHMENT');
CREATE TYPE "CommentThreadStatus" AS ENUM ('OPEN','RESOLVED');
CREATE TYPE "NotificationType" AS ENUM ('MENTION');

CREATE TABLE "User" ("id" TEXT PRIMARY KEY,"email" TEXT NOT NULL UNIQUE,"name" TEXT NOT NULL,"passwordHash" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "Workspace" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "WorkspaceMember" ("workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"role" "WorkspaceRole" NOT NULL DEFAULT 'EDITOR',PRIMARY KEY("workspaceId","userId"));
CREATE TABLE "Project" ("id" TEXT PRIMARY KEY,"workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,"name" TEXT NOT NULL,"key" TEXT NOT NULL,"requirementSequence" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("workspaceId","key"));
CREATE TABLE "RequirementFolder" ("id" TEXT PRIMARY KEY,"workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,"name" TEXT NOT NULL,"description" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,UNIQUE("workspaceId","name"));
CREATE TABLE "Requirement" ("id" TEXT PRIMARY KEY,"projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,"code" TEXT NOT NULL,"type" "RequirementType" NOT NULL,"title" TEXT NOT NULL,"content" JSONB NOT NULL,"status" "RequirementStatus" NOT NULL DEFAULT 'DRAFT',"folderId" TEXT NOT NULL REFERENCES "RequirementFolder"("id") ON DELETE RESTRICT,"source" TEXT NOT NULL DEFAULT 'MANUAL',"revision" INTEGER NOT NULL DEFAULT 1,"archivedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,UNIQUE("projectId","code"));
CREATE TABLE "AcceptanceCriterion" ("id" TEXT PRIMARY KEY,"requirementId" TEXT NOT NULL REFERENCES "Requirement"("id") ON DELETE CASCADE,"text" TEXT NOT NULL,"title" TEXT,"given" TEXT,"when" TEXT,"then" TEXT,"content" JSONB,"position" INTEGER NOT NULL,UNIQUE("requirementId","position"));
CREATE TABLE "RequirementReference" ("id" TEXT PRIMARY KEY,"requirementId" TEXT NOT NULL REFERENCES "Requirement"("id") ON DELETE CASCADE,"type" "ReferenceType" NOT NULL,"name" TEXT NOT NULL,"url" TEXT NOT NULL,"position" INTEGER NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "DocumentTemplate" ("id" TEXT PRIMARY KEY,"workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,"name" TEXT NOT NULL,"description" TEXT,"content" JSONB NOT NULL,"acceptanceCriteria" JSONB,"createdById" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,UNIQUE("workspaceId","name"));
CREATE TABLE "CommentThread" ("id" TEXT PRIMARY KEY,"requirementId" TEXT NOT NULL REFERENCES "Requirement"("id") ON DELETE CASCADE,"authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"anchor" JSONB NOT NULL,"status" "CommentThreadStatus" NOT NULL DEFAULT 'OPEN',"resolvedAt" TIMESTAMP(3),"resolvedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "CommentMessage" ("id" TEXT PRIMARY KEY,"threadId" TEXT NOT NULL REFERENCES "CommentThread"("id") ON DELETE CASCADE,"authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"body" TEXT NOT NULL,"mentionedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "Notification" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"type" "NotificationType" NOT NULL,"commentMessageId" TEXT REFERENCES "CommentMessage"("id") ON DELETE CASCADE,"readAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "RequirementVersion" ("id" TEXT PRIMARY KEY,"requirementId" TEXT NOT NULL REFERENCES "Requirement"("id") ON DELETE CASCADE,"revision" INTEGER NOT NULL,"snapshot" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("requirementId","revision"));
CREATE TABLE "RequirementRelation" ("id" TEXT PRIMARY KEY,"sourceId" TEXT NOT NULL REFERENCES "Requirement"("id") ON DELETE CASCADE,"targetId" TEXT NOT NULL REFERENCES "Requirement"("id") ON DELETE CASCADE,"type" "RelationType" NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("sourceId","targetId","type"));
CREATE TABLE "ActivityLog" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"("id"),"projectId" TEXT NOT NULL,"action" TEXT NOT NULL,"entityId" TEXT NOT NULL,"metadata" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "ImpactAnalysis" ("id" TEXT PRIMARY KEY,"requirementId" TEXT NOT NULL REFERENCES "Requirement"("id") ON DELETE CASCADE,"status" "ImpactStatus" NOT NULL DEFAULT 'PENDING',"error" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "ImpactItem" ("id" TEXT PRIMARY KEY,"analysisId" TEXT NOT NULL REFERENCES "ImpactAnalysis"("id") ON DELETE CASCADE,"targetRequirementId" TEXT NOT NULL,"severity" TEXT NOT NULL,"rationale" TEXT NOT NULL,"decision" "ImpactDecision" NOT NULL DEFAULT 'PENDING',"suggestedRelationType" "RelationType",UNIQUE("analysisId","targetRequirementId"));

CREATE INDEX "Requirement_projectId_status_idx" ON "Requirement"("projectId","status");
CREATE INDEX "Requirement_folderId_status_idx" ON "Requirement"("folderId","status");
CREATE INDEX "RequirementReference_requirementId_type_position_idx" ON "RequirementReference"("requirementId","type","position");
CREATE INDEX "RequirementFolder_workspaceId_updatedAt_idx" ON "RequirementFolder"("workspaceId","updatedAt");
CREATE INDEX "DocumentTemplate_workspaceId_updatedAt_idx" ON "DocumentTemplate"("workspaceId","updatedAt");
CREATE INDEX "CommentThread_requirementId_status_createdAt_idx" ON "CommentThread"("requirementId","status","createdAt");
CREATE INDEX "CommentMessage_threadId_createdAt_idx" ON "CommentMessage"("threadId","createdAt");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId","readAt","createdAt");
CREATE INDEX "ActivityLog_projectId_createdAt_idx" ON "ActivityLog"("projectId","createdAt");
