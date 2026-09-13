/** Stable transport contracts shared by the web client and API boundary. */
export const requirementTypes = ['USER_STORY'] as const;
export type RequirementType = (typeof requirementTypes)[number];
export const requirementStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type RequirementStatus = (typeof requirementStatuses)[number];
export const relationTypes = ['RELATED_TO', 'DEPENDS_ON', 'BLOCKS', 'CONFLICTS_WITH'] as const;
export type RelationType = (typeof relationTypes)[number];
export const workspaceRoles = ['OWNER', 'EDITOR', 'VIEWER'] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];
export const referenceTypes = ['PROTOTYPE', 'ATTACHMENT'] as const;
export type ReferenceType = (typeof referenceTypes)[number];
export const aiSuggestionTypes = ['RELATION', 'REFERENCE'] as const;
export type AiSuggestionType = (typeof aiSuggestionTypes)[number];
export const aiSuggestionStatuses = ['PENDING', 'CONFIRMED', 'DISMISSED'] as const;
export type AiSuggestionStatus = (typeof aiSuggestionStatuses)[number];
export const aiSuggestionDecisions = ['approve', 'dismiss'] as const;
export type AiSuggestionDecision = (typeof aiSuggestionDecisions)[number];
export const commentThreadStatuses = ['OPEN', 'RESOLVED'] as const;
export type CommentThreadStatus = (typeof commentThreadStatuses)[number];
export const notificationTypes = ['MENTION'] as const;
export type NotificationType = (typeof notificationTypes)[number];

export type TipTapMark = { type: string; attrs?: Record<string, unknown> };
export type TipTapNode = { type: string; attrs?: Record<string, unknown>; content?: TipTapNode[]; text?: string; marks?: TipTapMark[] };
export type TipTapDocument = { type: 'doc'; content?: TipTapNode[] };
export type JsonDocument = TipTapDocument | Record<string, unknown>;
export interface ApiError { error: { code: string; message: string; details?: unknown } }
export interface UserResponse { id: string; name: string; email: string }
export interface WorkspaceResponse { id: string; name: string; role?: WorkspaceRole }
export interface ProjectResponse { id: string; name: string; key: string }
export interface WorkspaceSummaryResponse extends WorkspaceResponse { role: WorkspaceRole; projects: ProjectResponse[] }
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
export interface NotificationResponse { id: string; type: NotificationType; readAt?: string | null; createdAt: string; commentMessage?: { author: Pick<UserResponse, 'id' | 'name'>; thread: { requirement: Pick<RequirementResponse, 'id' | 'title' | 'projectId'> } } | null }
export interface CreateCommentPayload { body: string; anchor?: CommentAnchor; mentionedUserIds?: string[] }
export interface CreateCommentReplyPayload { body: string; mentionedUserIds?: string[] }
export interface CreateReferencePayload { type: ReferenceType; name: string; url: string; position?: number }
export interface AiSuggestionResponse {
  id: string; analysisId: string; requirementId: string; type: AiSuggestionType;
  targetRequirementId?: string | null; relationType?: RelationType | null;
  referenceType?: ReferenceType | null; url?: string | null; confidence: number;
  justification: string; status: AiSuggestionStatus; error?: string | null;
  createdAt: string; updatedAt: string;
}
