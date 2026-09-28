import type {
  CommentAnchor,
  CommentThreadStatus,
  NotificationType,
  ReferenceType as SharedReferenceType,
  RelationType as SharedRelationType,
  RequirementStatus as SharedRequirementStatus,
  RequirementType as SharedRequirementType,
  WorkspaceRole as SharedWorkspaceRole,
  ProjectRole as SharedProjectRole,
  AccessRequestStatus as SharedAccessRequestStatus,
  AccessScope as SharedAccessScope,
} from '@athena/shared';

export type RequirementType = SharedRequirementType;
export type RequirementStatus = SharedRequirementStatus;
export type RelationType = SharedRelationType;
export type WorkspaceRole = SharedWorkspaceRole;
export type ProjectRole = SharedProjectRole;
export type AccessRequestStatus = SharedAccessRequestStatus;
export type AccessScope = SharedAccessScope;
export type ReferenceType = SharedReferenceType;
export type { CommentAnchor, CommentThreadStatus, NotificationType };

export interface User { id: string; name: string; email: string }
export interface Workspace { id: string; name: string; role?: WorkspaceRole | null; archivedAt?: string | null }
export interface Project { id: string; name: string; key: string; role?: WorkspaceRole | ProjectRole; archivedAt?: string | null }
export interface WorkspaceSummary extends Workspace { role: WorkspaceRole | null; projects: Project[] }

export interface AcceptanceCriterion {
  id?: string;
  title?: string;
  given?: string;
  whenText?: string;
  thenText?: string;
  text?: string;
  position: number;
  content?: Record<string, unknown> | null;
}

export interface RequirementReference {
  id: string;
  type: ReferenceType;
  name: string;
  url: string;
  createdAt?: string;
}

export interface Requirement {
  id: string;
  projectId: string;
  code: string;
  type: RequirementType;
  title: string;
  content: Record<string, unknown>;
  status: RequirementStatus;
  folderId: string;
  folder?: RequirementFolder;
  source: string;
  revision: number;
  criteria: AcceptanceCriterion[];
  references?: RequirementReference[];
  createdAt?: string;
  updatedAt?: string;
}
export interface RequirementVersion {
  id: string | null;
  requirementId: string;
  revision: number;
  snapshot: Pick<Requirement, 'title' | 'content' | 'folderId' | 'status' | 'criteria'> & { revision: number };
  createdAt?: string;
  current?: boolean;
}
export interface RequirementDiff {
  from: number;
  to: number;
  changedFields: string[];
  changes: { title: { from: string; to: string } | null; document: { from: Record<string, unknown>; to: Record<string, unknown> } | null; folder: { from: string; to: string } | null };
  criteriaAdded: string[];
  criteriaRemoved: string[];
}
export interface RequirementFolder { id: string; workspaceId: string; projectId?: string | null; name: string; description?: string | null; parentId?: string | null; requirementCount?: number; }

export interface RequirementTemplate {
  id: string;
  name: string;
  description?: string | null;
  content: Record<string, unknown>;
  criteria?: AcceptanceCriterion[];
  acceptanceCriteria?: AcceptanceCriterion[];
  createdBy?: Pick<User, 'id' | 'name'>;
  updatedAt?: string;
}

export interface WorkspaceReviewChecklist {
  items: string[];
}

export interface WorkspaceMember {
  id?: string;
  role: WorkspaceRole;
  user: User;
}
export interface WorkspaceParticipant { id: string; name: string }

export interface CommentMessage {
  id: string;
  body: string;
  author: User;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  requirementId: string;
  quote?: string | null;
  anchor?: CommentAnchor | null;
  status: CommentThreadStatus;
  author: User;
  messages: CommentMessage[];
  resolvedBy?: User | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  readAt?: string | null;
  createdAt: string;
  commentMessage?: { author: Pick<User, 'id' | 'name'>; thread: { requirement: Pick<Requirement, 'id' | 'title' | 'projectId'> } } | null;
  accessRequest?: AccessRequest | null;
}

export interface AccessRequest {
  id: string;
  projectId: string;
  workspaceId: string;
  status: AccessRequestStatus;
  scope?: AccessScope | null;
  role?: ProjectRole | null;
  createdAt: string;
  decidedAt?: string | null;
  requester?: Pick<User, 'id' | 'name' | 'email'>;
  project?: Pick<Project, 'id' | 'name' | 'key'>;
  workspace?: Pick<Workspace, 'id' | 'name'>;
}

export interface GraphNode {
  id: string;
  code: string;
  title: string;
  type: RequirementType;
  status: RequirementStatus;
}

export interface GraphEdge { id: string; source: string; target: string; type: RelationType }
export interface GraphResponse { nodes: GraphNode[]; edges: GraphEdge[] }

export interface RequirementRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  source: Requirement;
  target: Requirement;
}


export type IntegrationCandidateStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED';
export type IntegrationCandidateChangeType = 'CREATED' | 'UPDATED' | 'REMOVED';
export interface IntegrationCandidate {
  id: string;
  externalId: string;
  title: string;
  content: { provider?: string; content?: unknown; mimeType?: string };
  status: IntegrationCandidateStatus;
  changeType: IntegrationCandidateChangeType;
  externalVersion?: string | null;
  previousTitle?: string | null;
  previousContent?: { provider?: string; content?: unknown; mimeType?: string } | null;
  updatedAt: string;
  source?: { name: string; removedAt?: string | null } | null;
  connection?: { kind: 'GITHUB' | 'GOOGLE'; workspaceId: string };
}
export type GoogleSyncStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'IDLE';
export interface GoogleSyncRunItem { id: string; title: string; externalId: string; changeType: IntegrationCandidateChangeType; createdAt: string; candidate?: Pick<IntegrationCandidate, 'status' | 'content' | 'previousContent' | 'previousTitle' | 'updatedAt'> | null; }
export interface GoogleSyncRun { id: string; status: GoogleSyncStatus; startedAt: string; completedAt?: string | null; scannedCount: number; changedCount: number; error?: string | null; itemCount: number; folder: { id: string; name: string; project?: Project | null }; }
export interface CursorPage<T> { items: T[]; nextCursor: string | null; }
