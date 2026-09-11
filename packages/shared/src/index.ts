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
export type TipTapDocument = { type: 'doc'; content?: TipTapNode[] };
export type TipTapNode = { type: string; attrs?: Record<string, unknown>; content?: TipTapNode[]; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };

export interface ApiError { error: { code: string; message: string; details?: unknown } }
export interface AcceptanceCriterionResponse {
  id: string; text: string; position: number; title?: string | null;
  given?: string | null; whenText?: string | null; thenText?: string | null;
  content?: TipTapDocument | Record<string, unknown> | null;
}
export interface RequirementResponse {
  id: string; code: string; type: RequirementType; title: string; content: TipTapDocument | Record<string, unknown>;
  status: RequirementStatus; folderId: string; folder?: RequirementFolderResponse; source: string; revision: number;
  criteria: AcceptanceCriterionResponse[];
}
export interface RequirementFolderResponse { id: string; workspaceId: string; name: string; description?: string | null; requirementCount?: number; }
export interface GraphResponse { nodes: Array<{ id: string; code: string; title: string; type: RequirementType; status: RequirementStatus }>; edges: Array<{ id: string; source: string; target: string; type: RelationType }> }
export interface RequirementReferenceResponse { id:string; requirementId:string; type:ReferenceType; name:string; url:string; position:number; createdAt:string; }
export interface WorkspaceMemberResponse { role:WorkspaceRole; user:{id:string; name:string; email:string}; }
export interface DocumentTemplateResponse { id:string; workspaceId:string; name:string; description?:string | null; content:TipTapDocument | Record<string,unknown>; acceptanceCriteria?:AcceptanceCriterionResponse[] | null; createdById:string; createdAt:string; updatedAt:string; }
export interface CommentMessageResponse { id:string; threadId:string; body:string; mentionedUserIds:string[]; createdAt:string; author:{id:string;name:string;email:string}; }
export interface CommentThreadResponse { id:string; requirementId:string; authorId:string; anchor:{from:number;to:number;quote:string;prefix?:string;suffix?:string}; status:'OPEN'|'RESOLVED'; createdAt:string; updatedAt:string; author:{id:string;name:string;email:string}; messages:CommentMessageResponse[]; }
