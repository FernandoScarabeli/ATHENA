/** Stable transport contracts shared by the web client and API boundary. */
export const requirementTypes = ['USER_STORY'] as const;
export type RequirementType = (typeof requirementTypes)[number];
export const requirementStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type RequirementStatus = (typeof requirementStatuses)[number];
export const relationTypes = ['RELATED_TO', 'DEPENDS_ON', 'BLOCKS'] as const;
export type RelationType = (typeof relationTypes)[number];
export const workspaceRoles = ['OWNER', 'MANAGER', 'EDITOR', 'VIEWER'] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];
export const projectRoles = ['EDITOR', 'VIEWER'] as const;
export type ProjectRole = (typeof projectRoles)[number];
export const accessRequestStatuses = ['PENDING', 'APPROVED', 'DENIED'] as const;
export type AccessRequestStatus = (typeof accessRequestStatuses)[number];
export const accessScopes = ['PROJECT', 'WORKSPACE'] as const;
export type AccessScope = (typeof accessScopes)[number];
export const referenceTypes = ['PROTOTYPE', 'ATTACHMENT'] as const;
export type ReferenceType = (typeof referenceTypes)[number];
export const commentThreadStatuses = ['OPEN', 'RESOLVED'] as const;
export type CommentThreadStatus = (typeof commentThreadStatuses)[number];
export const notificationTypes = ['MENTION', 'ACCESS_REQUEST', 'ACCESS_DECISION'] as const;
export type NotificationType = (typeof notificationTypes)[number];

export type TipTapMark = { type: string; attrs?: Record<string, unknown> };
export type TipTapNode = { type: string; attrs?: Record<string, unknown>; content?: TipTapNode[]; text?: string; marks?: TipTapMark[] };
export type TipTapDocument = { type: 'doc'; content?: TipTapNode[] };
export type JsonDocument = TipTapDocument | Record<string, unknown>;
export interface ApiError { error: { code: string; message: string; details?: unknown } }
export interface UserResponse { id: string; name: string; email: string }
export interface WorkspaceResponse { id: string; name: string; role?: WorkspaceRole | null }
export interface ProjectResponse { id: string; name: string; key: string; role?: ProjectRole | WorkspaceRole }
export interface WorkspaceSummaryResponse extends WorkspaceResponse { role: WorkspaceRole | null; projects: ProjectResponse[] }
export interface AcceptanceCriterionResponse { id?: string; text: string; position: number; title?: string | null; given?: string | null; whenText?: string | null; thenText?: string | null; content?: JsonDocument | null }
export interface AcceptanceCriterionInput { text: string; position?: number; title?: string; given?: string; when?: string; then?: string; content?: Record<string, unknown> | null }
export interface RequirementFolderResponse { id: string; workspaceId: string; name: string; description?: string | null; parentId?: string | null; requirementCount?: number }
export interface RequirementReferenceResponse { id: string; requirementId: string; type: ReferenceType; name: string; url: string; position: number; createdAt: string }
export interface RequirementResponse { id: string; projectId: string; code: string; type: RequirementType; title: string; content: JsonDocument; status: RequirementStatus; folderId: string; folder?: RequirementFolderResponse; source: string; revision: number; criteria: AcceptanceCriterionResponse[]; references?: RequirementReferenceResponse[]; createdAt?: string; updatedAt?: string }
export interface RequirementVersionResponse { id: string | null; requirementId: string; revision: number; snapshot: Pick<RequirementResponse, 'title' | 'content' | 'folderId' | 'status' | 'criteria'> & { revision: number }; createdAt: string; current?: boolean }
export interface RequirementDiffResponse { from: number; to: number; changedFields: string[]; changes: { title: { from: string; to: string } | null; document: { from: JsonDocument; to: JsonDocument } | null; folder: { from: string; to: string } | null }; criteriaAdded: string[]; criteriaRemoved: string[] }
export interface GraphNodeResponse { id: string; code: string; title: string; type: RequirementType; status: RequirementStatus }
export interface GraphEdgeResponse { id: string; source: string; target: string; type: RelationType }
export interface GraphResponse { nodes: GraphNodeResponse[]; edges: GraphEdgeResponse[] }
export interface RequirementRelationResponse { id: string; sourceId: string; targetId: string; type: RelationType; source: RequirementResponse; target: RequirementResponse }
export interface WorkspaceMemberResponse { role: WorkspaceRole; user: UserResponse }
export interface WorkspaceParticipantResponse { id: string; name: string }
export interface DocumentTemplateResponse { id: string; workspaceId: string; name: string; description?: string | null; content: JsonDocument; acceptanceCriteria?: AcceptanceCriterionResponse[] | null; createdById: string; createdAt: string; updatedAt: string }
export interface CommentAnchor { from: number; to: number; quote: string; prefix?: string; suffix?: string }
export interface CommentMessageResponse { id: string; threadId: string; body: string; mentionedUserIds: string[]; createdAt: string; author: UserResponse }
export interface CommentThreadResponse { id: string; requirementId: string; authorId: string; anchor?: CommentAnchor | null; status: CommentThreadStatus; createdAt: string; updatedAt: string; author: UserResponse; resolvedBy?: Pick<UserResponse, 'id' | 'name'> | null; resolvedAt?: string | null; messages: CommentMessageResponse[] }
export interface AccessRequestResponse { id: string; projectId: string; workspaceId: string; status: AccessRequestStatus; scope?: AccessScope | null; role?: ProjectRole | null; createdAt: string; decidedAt?: string | null; requester?: Pick<UserResponse, 'id' | 'name' | 'email'>; project?: Pick<ProjectResponse, 'id' | 'name' | 'key'>; workspace?: Pick<WorkspaceResponse, 'id' | 'name'> }
export interface NotificationResponse { id: string; type: NotificationType; readAt?: string | null; createdAt: string; commentMessage?: { author: Pick<UserResponse, 'id' | 'name'>; thread: { requirement: Pick<RequirementResponse, 'id' | 'title' | 'projectId'> } } | null; accessRequest?: AccessRequestResponse | null }
export interface CreateCommentPayload { body: string; anchor?: CommentAnchor; mentionedUserIds?: string[] }
export interface CreateCommentReplyPayload { body: string; mentionedUserIds?: string[] }
export interface CreateReferencePayload { type: ReferenceType; name: string; url: string; position?: number }
