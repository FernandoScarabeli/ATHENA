CREATE TYPE "ProjectRole" AS ENUM ('EDITOR', 'VIEWER');
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');
CREATE TYPE "AccessScope" AS ENUM ('PROJECT', 'WORKSPACE');

ALTER TYPE "NotificationType" ADD VALUE 'ACCESS_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'ACCESS_DECISION';

CREATE TABLE "ProjectMember" (
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ProjectRole" NOT NULL DEFAULT 'VIEWER',
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId", "userId"),
  CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProjectMember_userId_projectId_idx" ON "ProjectMember"("userId", "projectId");

CREATE TABLE "ProjectInvite" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "ProjectRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "deliveryError" TEXT,
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectInvite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectInvite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectInvite_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectInvite_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectInvite_tokenHash_key" ON "ProjectInvite"("tokenHash");
CREATE INDEX "ProjectInvite_projectId_email_idx" ON "ProjectInvite"("projectId", "email");
CREATE INDEX "ProjectInvite_email_expiresAt_idx" ON "ProjectInvite"("email", "expiresAt");

CREATE TABLE "AccessRequest" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
  "activeKey" TEXT DEFAULT 'PENDING',
  "scope" "AccessScope",
  "role" "ProjectRole",
  "decidedById" TEXT,
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccessRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccessRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccessRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccessRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccessRequest_projectId_requesterId_activeKey_key" ON "AccessRequest"("projectId", "requesterId", "activeKey");
CREATE INDEX "AccessRequest_workspaceId_status_createdAt_idx" ON "AccessRequest"("workspaceId", "status", "createdAt");
CREATE INDEX "AccessRequest_projectId_status_createdAt_idx" ON "AccessRequest"("projectId", "status", "createdAt");
CREATE INDEX "AccessRequest_requesterId_createdAt_idx" ON "AccessRequest"("requesterId", "createdAt");

ALTER TABLE "Notification" ADD COLUMN "accessRequestId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_accessRequestId_fkey"
  FOREIGN KEY ("accessRequestId") REFERENCES "AccessRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Notification_accessRequestId_idx" ON "Notification"("accessRequestId");
