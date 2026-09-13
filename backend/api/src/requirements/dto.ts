import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, Validate, ValidateNested, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

export enum StatusDto { DRAFT='DRAFT', ACTIVE='ACTIVE', ARCHIVED='ARCHIVED' }
export enum RelationDto { RELATED_TO='RELATED_TO', DEPENDS_ON='DEPENDS_ON', BLOCKS='BLOCKS', CONFLICTS_WITH='CONFLICTS_WITH' }
export enum WorkspaceRoleDto { OWNER='OWNER', EDITOR='EDITOR', VIEWER='VIEWER' }
export enum ReferenceTypeDto { PROTOTYPE='PROTOTYPE', ATTACHMENT='ATTACHMENT' }

const nodeAttrs: Record<string, string[]> = {
  paragraph:['textAlign'], heading:['level','textAlign'], orderedList:['start'], taskItem:['checked'], codeBlock:['language'],
  table:[], tableRow:['backgroundColor'], tableCell:['colspan','rowspan','colwidth','backgroundColor'], tableHeader:['colspan','rowspan','colwidth','backgroundColor'],
};
const marks = new Set(['bold','italic','underline','strike','code','link','textStyle']);
const nodes = new Set(['doc','paragraph','text','heading','bulletList','orderedList','listItem','blockquote','codeBlock','hardBreak','horizontalRule','taskList','taskItem','table','tableRow','tableHeader','tableCell']);
const safeUrl = (href: unknown) => typeof href === 'string' && /^(https?:\/\/|mailto:)/i.test(href);
const safeFontFamilies = new Set(['Inter','Arial','Georgia','Times New Roman','Verdana','Courier New']);
const safeFontSizes = new Set(['10px','11px','12px','14px','16px','18px','24px','32px']);
const safeColor = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value));
const nodeKeys: Record<string, string[]> = {
  doc:['type','content'], paragraph:['type','attrs','content'], text:['type','text','marks'], heading:['type','attrs','content'],
  bulletList:['type','content'], orderedList:['type','attrs','content'], listItem:['type','content'], blockquote:['type','content'],
  codeBlock:['type','attrs','content'], hardBreak:['type'], horizontalRule:['type'], taskList:['type','content'], taskItem:['type','attrs','content'],
  table:['type','content'], tableRow:['type','attrs','content'], tableHeader:['type','attrs','content'], tableCell:['type','attrs','content'],
};
const markKeys: Record<string, string[]> = {
  bold:['type'], italic:['type'], underline:['type'], strike:['type'], code:['type'], link:['type','attrs'], textStyle:['type','attrs'],
};
function validAttrs(type: string, attrs: unknown): boolean {
  if (attrs === undefined) return true;
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return false;
  const value = attrs as Record<string, unknown>;
  if (Object.keys(value).some(key => !(nodeAttrs[type] ?? []).includes(key))) return false;
  if (type === 'heading' && (!Number.isInteger(value.level) || (value.level as number) < 1 || (value.level as number) > 6)) return false;
  if ((type === 'paragraph' || type === 'heading') && value.textAlign !== undefined && value.textAlign !== null && !['left','center','right','justify'].includes(String(value.textAlign))) return false;
  if (type === 'orderedList' && value.start !== undefined && (!Number.isInteger(value.start) || (value.start as number) < 1)) return false;
  if (type === 'taskItem' && value.checked !== undefined && typeof value.checked !== 'boolean') return false;
  if (type === 'codeBlock' && value.language !== undefined && value.language !== null && typeof value.language !== 'string') return false;
  if ((type === 'tableCell' || type === 'tableHeader') && value.colspan !== undefined && (!Number.isInteger(value.colspan) || (value.colspan as number) < 1)) return false;
  if ((type === 'tableCell' || type === 'tableHeader') && value.rowspan !== undefined && (!Number.isInteger(value.rowspan) || (value.rowspan as number) < 1)) return false;
  if ((type === 'tableCell' || type === 'tableHeader') && value.colwidth !== undefined && value.colwidth !== null && (!Array.isArray(value.colwidth) || value.colwidth.some(width => !Number.isInteger(width) || width < 1))) return false;
  if ((type === 'tableRow' || type === 'tableCell' || type === 'tableHeader') && value.backgroundColor !== undefined && value.backgroundColor !== null && (typeof value.backgroundColor !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(value.backgroundColor))) return false;
  return true;
}
export function validTipTap(value: unknown, root = true): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as { type?: unknown; attrs?: unknown; marks?: unknown; text?: unknown; content?: unknown };
  const nodeType = v.type;
  if (typeof nodeType !== 'string' || !nodes.has(nodeType) || (root && nodeType !== 'doc') || !validAttrs(nodeType, v.attrs)) return false;
  if (Object.keys(value as object).some(key => !(nodeKeys[nodeType] ?? []).includes(key))) return false;
  if (v.marks !== undefined) {
    if (!Array.isArray(v.marks)) return false;
    for (const mark of v.marks as Array<{type?: unknown; attrs?: unknown}>) {
      const markType = mark?.type;
      if (!mark || typeof mark !== 'object' || typeof markType !== 'string' || !marks.has(markType) || Object.keys(mark).some(key => !(markKeys[markType] ?? []).includes(key))) return false;
      if (markType === 'link') {
        if (!mark.attrs || typeof mark.attrs !== 'object' || Array.isArray(mark.attrs)) return false;
        const attrs = mark.attrs as Record<string, unknown>;
        if (Object.keys(attrs).some(key => !['href','target','rel','class'].includes(key)) || !safeUrl(attrs.href)) return false;
      } else if (markType === 'textStyle') {
        if (!mark.attrs || typeof mark.attrs !== 'object' || Array.isArray(mark.attrs)) return false;
        const attrs = mark.attrs as Record<string, unknown>;
        if (Object.keys(attrs).some(key => !['fontSize','fontFamily','color','backgroundColor'].includes(key))) return false;
        if (attrs.fontSize !== undefined && attrs.fontSize !== null && !safeFontSizes.has(String(attrs.fontSize))) return false;
        if (attrs.fontFamily !== undefined && attrs.fontFamily !== null && !safeFontFamilies.has(String(attrs.fontFamily))) return false;
        if (!safeColor(attrs.color) || !safeColor(attrs.backgroundColor)) return false;
      } else if (mark.attrs !== undefined && (typeof mark.attrs !== 'object' || Object.keys(mark.attrs as object).length > 0)) return false;
    }
  }
  if (v.type === 'text' && typeof v.text !== 'string') return false;
  return v.content === undefined || (Array.isArray(v.content) && v.content.every(child => validTipTap(child, false)));
}
@ValidatorConstraint({ name:'isTipTapDocument', async:false })
export class TipTapDocumentConstraint implements ValidatorConstraintInterface {
  validate(value:unknown) { return value === undefined || (JSON.stringify(value).length <= 256 * 1024 && ((value && typeof value === 'object' && Object.keys(value as object).length === 0) || validTipTap(value))); }
  defaultMessage() { return 'content deve ser um documento TipTap válido de até 256 KB'; }
}
export class CriterionDto {
  @IsString() @MaxLength(3000) text!: string;
  @IsOptional() @IsString() @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) given?: string;
  @IsOptional() @IsString() @MaxLength(5000) when?: string;
  @IsOptional() @IsString() @MaxLength(5000) then?: string;
  @IsOptional() @IsObject() @Validate(TipTapDocumentConstraint) content?: Record<string, unknown>;
}

export class CreateRequirementDto {
  @IsString() @MaxLength(240) title!:string;
  @IsObject() @Validate(TipTapDocumentConstraint) content: Record<string,unknown> = {};
  @IsOptional() @IsUUID() templateId?: string;
  @IsUUID() folderId!: string;
  @IsOptional() @IsString() source?:string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>CriterionDto) acceptanceCriteria?:CriterionDto[];
}
/** Fields intentionally mirror only the editable portion of a Requirement.
 * `type`, `source`, code and project are immutable after creation. */
export class UpdateRequirementDto {
  @IsInt() @Min(1) revision!: number;
  @IsOptional() @IsString() @MaxLength(240) title?: string;
  @IsOptional() @IsObject() @Validate(TipTapDocumentConstraint) content?: Record<string, unknown>;
  @IsOptional() @IsUUID() folderId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(() => CriterionDto) acceptanceCriteria?: CriterionDto[];
}
export class CreateRelationDto { @IsUUID() targetId!:string; @IsEnum(RelationDto) type!:RelationDto; }
export class CreateWorkspaceDto { @IsString() @MaxLength(120) name!:string; }
export class CreateProjectDto { @IsString() @MaxLength(120) name!:string; @IsString() @MaxLength(16) key!:string; }

export class AddWorkspaceMemberDto { @IsEmail() email!:string; @IsEnum(WorkspaceRoleDto) role!:WorkspaceRoleDto; }
export class UpdateWorkspaceMemberDto { @IsEnum(WorkspaceRoleDto) role!:WorkspaceRoleDto; }
export class CreateTemplateDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsObject() @Validate(TipTapDocumentConstraint) content!: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(() => CriterionDto) acceptanceCriteria?: CriterionDto[];
}
export class CreateFolderDto { @IsString() @Matches(/\S/, { message: 'O nome da pasta não pode ficar vazio' }) @MaxLength(120) name!: string; @IsOptional() @IsString() @MaxLength(500) description?: string; @IsOptional() @IsUUID() parentId?: string; }
export class UpdateFolderDto { @IsOptional() @IsString() @Matches(/\S/, { message: 'O nome da pasta não pode ficar vazio' }) @MaxLength(120) name?: string; @IsOptional() @IsString() @MaxLength(500) description?: string; @IsOptional() @IsUUID() parentId?: string | null; }
export class UpdateTemplateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsObject() @Validate(TipTapDocumentConstraint) content?: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(() => CriterionDto) acceptanceCriteria?: CriterionDto[];
}
export class ApproveIntegrationCandidateDto {
  @IsUUID() projectId!: string;
  @IsOptional() @IsUUID() folderId?: string;
  @IsOptional() @IsUUID() requirementId?: string;
  @IsOptional() @IsString() expectedUpdatedAt?: string;
  @IsOptional() @IsInt() @Min(1) expectedRevision?: number;
}
export class RejectIntegrationCandidateDto { @IsOptional() @IsString() expectedUpdatedAt?: string; }
export class CreateReferenceDto { @IsEnum(ReferenceTypeDto) type!:ReferenceTypeDto; @IsString() @MaxLength(240) name!:string; @IsString() @MaxLength(2000) url!:string; @IsOptional() @IsInt() @Min(0) position?:number; }
export class CreateCommentDto { @IsString() @MaxLength(5000) body!:string; @IsOptional() @IsObject() anchor?: Record<string, unknown>; @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID('4',{each:true}) mentionedUserIds?: string[]; }
export class CreateCommentReplyDto { @IsString() @MaxLength(5000) body!:string; @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID('4',{each:true}) mentionedUserIds?: string[]; }
