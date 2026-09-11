export type RequirementType = 'USER_STORY';
export type RequirementStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type RelationType = 'RELATED_TO' | 'DEPENDS_ON' | 'BLOCKS' | 'CONFLICTS_WITH';
export type WorkspaceRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export type ReferenceType = 'PROTOTYPE' | 'ATTACHMENT';

export interface User { id: string; name: string; email: string }
export interface Workspace { id: string; name: string; role?: WorkspaceRole }
export interface Project { id: string; name: string; key: string }
export interface WorkspaceSummary extends Workspace { role: WorkspaceRole; projects: Project[] }

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
export interface RequirementFolder { id: string; workspaceId: string; name: string; description?: string | null; requirementCount?: number; }

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
  anchor?: { from?: number; to?: number; quote?: string } | null;
  status: 'OPEN' | 'RESOLVED';
  author: User;
  messages: CommentMessage[];
  resolvedBy?: User | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: 'MENTION' | string;
  readAt?: string | null;
  createdAt: string;
  commentMessage?: { author: Pick<User, 'id' | 'name'>; thread: { requirement: Pick<Requirement, 'id' | 'title' | 'projectId'> } } | null;
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
