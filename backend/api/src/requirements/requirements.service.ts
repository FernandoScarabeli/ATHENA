import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GoogleDriveOutboxOperation, GoogleSyncStatus, Prisma, ProjectRole, RelationType, RequirementType, WorkspaceRole } from '@prisma/client';
import { AddWorkspaceMemberDto, ConfirmDeleteDto, CreateCommentDto, CreateCommentReplyDto, CreateFolderDto, CreateProjectDto, CreateReferenceDto, CreateRelationDto, CreateRequirementDto, CreateTemplateDto, CreateWorkspaceDto, MoveProjectDto, UpdateFolderDto, UpdateProjectDto, UpdateRelationDto, UpdateRequirementDto, UpdateReviewChecklistDto, UpdateTemplateDto, UpdateWorkspaceDto, UpdateWorkspaceMemberDto } from './dto';
import { PrismaService } from '../core/prisma.service';
import { GoogleSyncService } from '../integrations/google-sync.service';
import { DEFAULT_REVIEW_CHECKLIST } from './review-checklist.defaults';
import { requireProjectAccess } from '../common/project-access';

const include = { criteria:{orderBy:{position:'asc' as const}}, references:{orderBy:{position:'asc' as const}}, folder:true };
const readRoles: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.MANAGER, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER];
const contentEditRoles: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.MANAGER, WorkspaceRole.EDITOR];
const workspaceSettingsEditRoles: WorkspaceRole[] = [WorkspaceRole.OWNER];
const projectManagerRoles: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.MANAGER];
const commentRoles = readRoles;
const normalizeRelation = <T extends { type: RelationType }>(relation: T): T => ({
  ...relation,
  type: relation.type === RelationType.CONFLICTS_WITH ? RelationType.BLOCKS : relation.type,
});
type CriterionInput = { text: string; title?: string; given?: string; when?: string; then?: string; content?: Record<string, unknown> };
type EditorialSnapshot = {
  revision: number;
  title: string;
  content: Prisma.JsonValue;
  folderId: string;
  status: string;
  criteria: Array<{ text: string; title?: string | null; given?: string | null; whenText?: string | null; thenText?: string | null; content?: Prisma.JsonValue | null; position: number }>;
};

@Injectable()
export class RequirementsService {
  private readonly logger = new Logger(RequirementsService.name);
  constructor(private prisma:PrismaService, private readonly googleSync?: GoogleSyncService) {}

  private async member(userId:string, workspaceId:string, allowed: WorkspaceRole[] = readRoles) {
    const member = await this.prisma.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId,userId}}, include:{workspace:{select:{archivedAt:true}}}});
    if (!member || !allowed.includes(member.role)) throw new ForbiddenException('Você não tem permissão para esta ação');
    if (member.workspace?.archivedAt) throw new NotFoundException('Este workspace está arquivado');
    return member;
  }
  private criteriaCreate(criteria: CriterionInput[] = []) {
    return criteria.map((criterion, position) => ({
      text:criterion.text, position, title:criterion.title, given:criterion.given, whenText:criterion.when,
      thenText:criterion.then, content:criterion.content as Prisma.InputJsonValue | undefined,
    }));
  }
  private editorialSnapshot(requirement: { revision: number; title: string; content: Prisma.JsonValue; folderId: string; status: string; criteria?: Array<{ text: string; title: string | null; given: string | null; whenText: string | null; thenText: string | null; content: Prisma.JsonValue | null; position: number }> }): EditorialSnapshot {
    return {
      revision: requirement.revision,
      title: requirement.title,
      content: requirement.content,
      folderId: requirement.folderId,
      status: requirement.status,
      criteria: (requirement.criteria ?? []).map(({ text, title, given, whenText, thenText, content, position }) => ({ text, title, given, whenText, thenText, content, position })),
    };
  }
  private validUrl(url:string) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return Boolean(parsed.hostname);
      return parsed.protocol === 'mailto:' && Boolean(parsed.pathname);
    } catch {
      return false;
    }
  }
  private normalizedFolderName(name: string) {
    return name.trim().replace(/\s+/g, ' ');
  }
  private assertEditableFolderName(name: string) {
    const normalized = this.normalizedFolderName(name);
    if (!normalized) throw new BadRequestException('O nome da pasta não pode ficar vazio');
    if (normalized.localeCompare('Sem pasta', 'pt-BR', { sensitivity: 'base' }) === 0) {
      throw new BadRequestException('A pasta Sem pasta é reservada e não pode ser renomeada');
    }
    return normalized;
  }
  private isUniqueConstraint(error: unknown) {
    return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
  }
  private isRelationConflict(error: unknown) {
    if (this.isUniqueConstraint(error)) return true;
    if (!error || typeof error !== 'object' || (error as { code?: string }).code !== 'P2010') return false;
    const text = JSON.stringify(error).toLowerCase();
    return text.includes('unique') || text.includes('duplicate') || text.includes('related_to_unordered_pair');
  }

  /**
   * Membership changes that can remove an Owner must be serialized.  A plain
   * count followed by an update/delete permits two concurrent requests to
   * both observe two Owners and remove them both. PostgreSQL's serializable
   * isolation makes one transaction retry (and then observe the remaining
   * Owner), while the retry keeps the API-level invariant intact.
   */
  private async ownerMembershipTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2034' || attempt === 2) throw error;
      }
    }
    throw new Error('unreachable');
  }

  private async memberOnTransaction(tx: Prisma.TransactionClient, userId: string, workspaceId: string, allowed: WorkspaceRole[]) {
    const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!member || !allowed.includes(member.role)) throw new ForbiddenException('Você não tem permissão para esta ação');
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { archivedAt: true } });
    if (!workspace || workspace.archivedAt) throw new NotFoundException('Este workspace está arquivado');
    return member;
  }

  async project(userId:string, projectId:string, allowed: WorkspaceRole[] = readRoles) {
    const edit = !allowed.includes(WorkspaceRole.VIEWER);
    return (await requireProjectAccess(this.prisma, userId, projectId, edit)).project;
  }
  async requirement(userId:string,id:string, allowed: WorkspaceRole[] = readRoles) {
    const requirement=await this.prisma.requirement.findUnique({where:{id},include});
    if(!requirement) throw new NotFoundException('Requisito não encontrado');
    await this.project(userId, requirement.projectId, allowed);
    return requirement;
  }

  async create(userId:string,projectId:string,dto:CreateRequirementDto) {
    const project = await this.project(userId,projectId,contentEditRoles);
    let template: { content: unknown; acceptanceCriteria: unknown } | null = null;
    if (dto.templateId) {
      await this.member(userId, project.workspaceId);
      template = await this.prisma.documentTemplate.findFirst({where:{id:dto.templateId,workspaceId:project.workspaceId},select:{content:true,acceptanceCriteria:true}});
      if (!template) throw new NotFoundException('Template não encontrado neste workspace');
    }
    const templateCriteria = Array.isArray(template?.acceptanceCriteria) ? template!.acceptanceCriteria as CriterionInput[] : [];
    const content = Object.keys(dto.content ?? {}).length ? dto.content : (template?.content ?? dto.content);
    // An omitted criteria field means “use the template”; an explicit empty
    // array is intentional and must create a requirement without criteria.
    const criteria = dto.acceptanceCriteria ?? templateCriteria;
    const folder = await this.prisma.requirementFolder.findFirst({where:{id:dto.folderId,projectId}});
    if (!folder) throw new NotFoundException('Pasta não encontrada neste projeto');
    const created = await this.prisma.$transaction(async tx=>{
      // A project-owned sequence avoids lexicographic ordering bugs (US-1000)
      // and remains safe when two editors create a story simultaneously.
      const sequence=await tx.project.update({where:{id:projectId},data:{requirementSequence:{increment:1}},select:{requirementSequence:true}});
      const requirement=await tx.requirement.create({data:{
        projectId,code:`US-${String(sequence.requirementSequence).padStart(3,'0')}`,type:RequirementType.USER_STORY,title:dto.title,
        content:content as Prisma.InputJsonValue,folderId:folder.id,source:dto.source??'MANUAL',
        criteria:{create:this.criteriaCreate(criteria)},
      },include});
      await tx.activityLog.create({data:{userId,projectId,action:'REQUIREMENT_CREATED',entityId:requirement.id,metadata:dto.templateId ? {templateId:dto.templateId} : undefined}});
      return requirement;
    });
    await this.googleSync?.queueRequirement(created.id, GoogleDriveOutboxOperation.CREATE);
    return created;
  }
  async list(userId:string,projectId:string,status:'active'|'archived' = 'active') {
    await this.project(userId,projectId);
    if (status !== 'active' && status !== 'archived') throw new BadRequestException('Status de requisito inválido');
    return this.prisma.requirement.findMany({where:{projectId,...(status === 'archived' ? { archivedAt:{ not:null } } : { archivedAt:null })},include,orderBy:{updatedAt:'desc'}});
  }
  async workspaces(userId:string, includeArchived = false) {
    const [memberships, projectMemberships] = await Promise.all([
      this.prisma.workspaceMember.findMany({where:{userId},select:{role:true,workspace:{select:{id:true,name:true,archivedAt:true,projects:{where:includeArchived?{}:{archivedAt:null},select:{id:true,name:true,key:true,archivedAt:true},orderBy:{name:'asc'}}}}}}),
      this.prisma.projectMember.findMany({where:{userId,project:{archivedAt:null,workspace:{archivedAt:null,members:{none:{userId}}}}},select:{role:true,project:{select:{id:true,name:true,key:true,archivedAt:true,workspace:{select:{id:true,name:true,archivedAt:true}}}}}}),
    ]);
    const workspaces = new Map<string, { id:string; name:string; archivedAt:Date|null; role:WorkspaceRole|null; projects:Array<{id:string;name:string;key:string;archivedAt:Date|null;role?:WorkspaceRole|ProjectRole}> }>();
    for (const {role,workspace} of memberships) {
      if (workspace.archivedAt && (!includeArchived || role !== WorkspaceRole.OWNER)) continue;
      const canSeeArchivedProjects = role === WorkspaceRole.OWNER || role === WorkspaceRole.MANAGER;
      const projects = workspace.projects.filter(project => !project.archivedAt || (includeArchived && canSeeArchivedProjects));
      workspaces.set(workspace.id,{...workspace,role,projects});
    }
    for (const {role,project} of projectMemberships) {
      const id=project.workspace.id;
      const current=workspaces.get(id) ?? {id,name:project.workspace.name,archivedAt:null,role:null,projects:[]};
      current.projects.push({id:project.id,name:project.name,key:project.key,archivedAt:project.archivedAt ?? null,role});
      workspaces.set(id,current);
    }
    return [...workspaces.values()].map(row=>({...row,projects:row.projects.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  }
  async update(userId:string,id:string,dto:UpdateRequirementDto) {
    const current=await this.requirement(userId,id,contentEditRoles);
    if (current.archivedAt || current.status==='ARCHIVED') throw new BadRequestException('US arquivada não aceita edição');
    if(current.revision!==dto.revision) throw new ConflictException({code:'REQUIREMENT_REVISION_CONFLICT',message:'O requisito foi alterado por outra pessoa',details:{currentRevision:current.revision}});
    const {revision,acceptanceCriteria,...data}=dto;
    if (data.folderId) {
      const project=await this.prisma.project.findUniqueOrThrow({where:{id:current.projectId},select:{workspaceId:true}});
      const folder=await this.prisma.requirementFolder.findFirst({where:{id:data.folderId,projectId:current.projectId}});
      if (!folder) throw new NotFoundException('Pasta não encontrada neste projeto');
    }
    const updated = await this.prisma.$transaction(async tx=>{
      const changed=await tx.requirement.updateMany({where:{id,revision:current.revision,archivedAt:null},data:{
        ...data,content:data.content as Prisma.InputJsonValue,status:current.status==='DRAFT'?'ACTIVE':undefined,revision:{increment:1},
      }});
      if (changed.count!==1) {
        const latest = await tx.requirement.findUnique({ where: { id }, select: { revision: true } });
        throw new ConflictException({
          code:'REQUIREMENT_REVISION_CONFLICT',
          message:'O requisito foi alterado por outra pessoa',
          details:{ currentRevision: latest?.revision ?? current.revision },
        });
      }
      if (acceptanceCriteria) {
        await tx.acceptanceCriterion.deleteMany({where:{requirementId:id}});
        if (acceptanceCriteria.length) await tx.acceptanceCriterion.createMany({data:this.criteriaCreate(acceptanceCriteria).map(criterion=>({...criterion,requirementId:id}))});
      }
      await tx.requirementVersion.create({data:{requirementId:id,revision:current.revision,snapshot:this.editorialSnapshot(current) as unknown as Prisma.InputJsonValue}});
      const updated=await tx.requirement.findUniqueOrThrow({where:{id},include});
      await tx.activityLog.create({data:{userId,projectId:current.projectId,action:'REQUIREMENT_UPDATED',entityId:id}});
      return updated;
    });
    await this.googleSync?.queueRequirement(updated.id, data.folderId && data.folderId !== current.folderId ? GoogleDriveOutboxOperation.MOVE : GoogleDriveOutboxOperation.UPDATE);
    return updated;
  }
  async archive(userId:string,id:string) {
    const requirement=await this.requirement(userId,id,contentEditRoles);
    const archivedRequirement = await this.prisma.$transaction(async tx=>{
      // updateMany makes cancellation idempotent and prevents a repeated request
      // from creating another activity entry or touching already preserved data.
      const archived=await tx.requirement.updateMany({where:{id:requirement.id,archivedAt:null},data:{status:'ARCHIVED',archivedAt:new Date()}});
      if (archived.count === 0) return tx.requirement.findUniqueOrThrow({where:{id:requirement.id},include});
      await tx.requirementRelation.deleteMany({where:{OR:[{sourceId:id},{targetId:id}]}});
      await tx.activityLog.create({data:{userId,projectId:requirement.projectId,action:'REQUIREMENT_ARCHIVED',entityId:id}});
      return tx.requirement.findUniqueOrThrow({where:{id:requirement.id},include});
    });
    await this.googleSync?.queueRequirement(archivedRequirement.id, GoogleDriveOutboxOperation.ARCHIVE);
    return archivedRequirement;
  }
  async versions(userId:string,id:string) {
    const requirement = await this.requirement(userId,id);
    const historical = await this.prisma.requirementVersion.findMany({where:{requirementId:id},orderBy:{revision:'desc'}});
    // RequirementVersion deliberately stores the state before each edit. The
    // current state is therefore represented from the authorized requirement,
    // without creating a fake database snapshot or exposing another workspace.
    const current = {
      id: null,
      requirementId: id,
      revision: requirement.revision,
      snapshot: this.editorialSnapshot(requirement),
      createdAt: requirement.updatedAt,
      current: true,
    };
    return [current, ...historical.map(version => ({ ...version, current: false }))];
  }
  async diff(userId:string,id:string,from:number,to:number) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) throw new BadRequestException('As revisões precisam ser inteiros positivos');
    const requirement = await this.requirement(userId,id);
    const historical = await this.prisma.requirementVersion.findMany({where:{requirementId:id,revision:{in:[from,to]}}});
    const snapshots = new Map<number, Prisma.JsonValue>();
    historical.forEach(version => snapshots.set(version.revision, version.snapshot));
    snapshots.set(requirement.revision, this.editorialSnapshot(requirement));
    const a = snapshots.get(from) as EditorialSnapshot | undefined;
    const b = snapshots.get(to) as EditorialSnapshot | undefined;
    if (!a || !b) throw new NotFoundException('Versão não encontrada neste requisito');
    const changedFields = (['title', 'content', 'folderId', 'status'] as const).filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
    const criteria = (value: EditorialSnapshot) => value.criteria ?? [];
    const criterionKey = (criterion: EditorialSnapshot['criteria'][number]) => JSON.stringify({ title: criterion.title ?? '', given: criterion.given ?? '', whenText: criterion.whenText ?? '', thenText: criterion.thenText ?? '', text: criterion.text ?? '', content: criterion.content ?? null });
    const criterionLabel = (criterion: EditorialSnapshot['criteria'][number]) => criterion.text || criterion.thenText || criterion.title || 'Critério sem descrição';
    const aa = new Map(criteria(a).map(criterion => [criterionKey(criterion), criterion]));
    const bb = new Map(criteria(b).map(criterion => [criterionKey(criterion), criterion]));
    return {
      from, to, changedFields,
      changes: {
        title: changedFields.includes('title') ? { from: a.title, to: b.title } : null,
        document: changedFields.includes('content') ? { from: a.content, to: b.content } : null,
        folder: changedFields.includes('folderId') ? { from: a.folderId, to: b.folderId } : null,
      },
      criteriaAdded: [...bb.entries()].filter(([key]) => !aa.has(key)).map(([, value]) => criterionLabel(value)),
      criteriaRemoved: [...aa.entries()].filter(([key]) => !bb.has(key)).map(([, value]) => criterionLabel(value)),
    };
  }
  async relate(userId:string,id:string,dto:CreateRelationDto) {
    const source=await this.requirement(userId,id,contentEditRoles),target=await this.requirement(userId,dto.targetId,contentEditRoles);
    if (source.status==='ARCHIVED' || target.status==='ARCHIVED') throw new BadRequestException('US cancelada não pode possuir relações');
    if(source.projectId!==target.projectId) throw new BadRequestException('Relações precisam pertencer ao mesmo projeto');
    if(id===dto.targetId) throw new BadRequestException('Autorrelação não permitida');
    const [firstId, secondId] = [id, dto.targetId].sort();
    try {
      return await this.prisma.$transaction(async (transaction) => {
        // The lock covers both directions while keeping existing multi-relation pairs intact.
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${firstId}), hashtext(${secondId}))::text`;
        const existing = await transaction.requirementRelation.findFirst({
          where: { OR: [{ sourceId: id, targetId: dto.targetId }, { sourceId: dto.targetId, targetId: id }] },
        });
        if (existing) throw new ConflictException('Estas US já possuem uma relação. Altere ou remova a existente.');
        return transaction.requirementRelation.create({data:{sourceId:id,targetId:dto.targetId,type:dto.type as RelationType}});
      });
    } catch (error) {
      if (this.isRelationConflict(error)) throw new ConflictException('Esta relação já existe');
      throw error;
    }
  }
  async relations(userId:string,id:string) { await this.requirement(userId,id); return (await this.prisma.requirementRelation.findMany({where:{OR:[{sourceId:id},{targetId:id}]},include:{source:true,target:true}})).map(normalizeRelation); }
  async updateRelation(userId:string,requirementId:string,relationId:string,dto:UpdateRelationDto) {
    const requirement = await this.requirement(userId,requirementId,contentEditRoles);
    if(requirement.status==='ARCHIVED') throw new BadRequestException('US cancelada não pode possuir relações');
    const relation=await this.prisma.requirementRelation.findFirst({where:{id:relationId,OR:[{sourceId:requirementId},{targetId:requirementId}]}});
    if(!relation) throw new NotFoundException('Relação não encontrada');
    const otherId = relation.sourceId === requirementId ? relation.targetId : relation.sourceId;
    const sourceId = dto.direction === 'CURRENT_TO_OTHER' ? requirementId : dto.direction === 'OTHER_TO_CURRENT' ? otherId : relation.sourceId;
    const targetId = sourceId === requirementId ? otherId : requirementId;
    try {
      return normalizeRelation(await this.prisma.requirementRelation.update({where:{id:relationId},data:{sourceId,targetId,type:dto.type as RelationType},include:{source:true,target:true}}));
    } catch (error) {
      if (this.isRelationConflict(error)) throw new ConflictException('Esta relação já existe com esse tipo');
      throw error;
    }
  }
  async removeRelation(userId:string, requirementId:string, relationId:string) {
    await this.requirement(userId,requirementId,contentEditRoles);
    const relation=await this.prisma.requirementRelation.findFirst({where:{id:relationId,OR:[{sourceId:requirementId},{targetId:requirementId}]}});
    if(!relation) throw new NotFoundException('Relação não encontrada');
    return this.prisma.requirementRelation.delete({where:{id:relationId}});
  }
  async graph(userId:string,projectId:string) { await this.project(userId,projectId); const requirements=await this.prisma.requirement.findMany({where:{projectId,archivedAt:null},select:{id:true,code:true,title:true,type:true,status:true}}); const ids=requirements.map(requirement=>requirement.id); const edges=await this.prisma.requirementRelation.findMany({where:{sourceId:{in:ids},targetId:{in:ids}}}); return {nodes:requirements,edges:edges.map(edge=>({id:edge.id,source:edge.sourceId,target:edge.targetId,type:normalizeRelation(edge).type}))}; }
  async folders(userId:string,projectId:string) { await this.project(userId,projectId); return this.prisma.requirementFolder.findMany({where:{projectId},orderBy:{name:'asc'},include:{_count:{select:{requirements:{where:{archivedAt:null}}}}}}).then(folders=>folders.map(folder=>({...folder,requirementCount:folder._count.requirements,_count:undefined}))); }
  async createFolder(userId:string,projectId:string,dto:CreateFolderDto) {
    const project = await this.project(userId,projectId,contentEditRoles);
    const name = this.assertEditableFolderName(dto.name);
    if (dto.parentId) { const parent = await this.prisma.requirementFolder.findFirst({ where: { id: dto.parentId, projectId } }); if (!parent) throw new NotFoundException('Pasta pai não encontrada neste projeto'); }
    const duplicate = await this.prisma.requirementFolder.findFirst({ where: { projectId, parentId: dto.parentId ?? null, name: { equals: name, mode: 'insensitive' } } });
    if (duplicate) throw new ConflictException('Já existe uma pasta com este nome neste nível');
    try {
      const folder = await this.prisma.requirementFolder.create({data:{workspaceId:project.workspaceId,projectId,name,parentId:dto.parentId ?? null,description:dto.description?.trim()||null}});
      await this.googleSync?.queueFolder(folder.id, GoogleDriveOutboxOperation.CREATE_FOLDER);
      return folder;
    } catch (error) {
      if (this.isUniqueConstraint(error)) throw new ConflictException('Já existe uma pasta com este nome neste projeto');
      throw error;
    }
  }
  async updateFolder(userId:string,projectId:string,id:string,dto:UpdateFolderDto) {
    const folder=await this.prisma.requirementFolder.findFirst({where:{id,projectId}});
    if(!folder) throw new NotFoundException('Pasta não encontrada neste projeto');
    await this.project(userId,projectId,contentEditRoles);
    if (folder.name.localeCompare('Sem pasta', 'pt-BR', { sensitivity: 'base' }) === 0) {
      if (dto.name !== undefined) throw new BadRequestException('A pasta Sem pasta é reservada e não pode ser renomeada');
      if (dto.parentId !== undefined && dto.parentId !== null) throw new BadRequestException('A pasta Sem pasta é reservada e não pode ser movida');
    }
    const name = dto.name === undefined ? undefined : this.assertEditableFolderName(dto.name);
    const parentId = dto.parentId === undefined ? folder.parentId : dto.parentId;
    if (parentId) {
      if (parentId === id) throw new BadRequestException('Uma pasta não pode ser pai de si mesma');
      let parent = await this.prisma.requirementFolder.findFirst({ where: { id: parentId, projectId: folder.projectId } });
      if (!parent) throw new NotFoundException('Pasta pai não encontrada neste projeto');
      const seen = new Set<string>();
      while (parent) { if (parent.id === id || seen.has(parent.id)) throw new BadRequestException('A pasta pai criaria um ciclo'); seen.add(parent.id); parent = parent.parentId ? await this.prisma.requirementFolder.findUnique({ where: { id: parent.parentId } }) : null; }
    }
    if (name !== undefined) {
      const duplicate = await this.prisma.requirementFolder.findFirst({ where: { projectId: folder.projectId, parentId, name: { equals: name, mode: 'insensitive' }, NOT: { id } } });
      if (duplicate) throw new ConflictException('Já existe uma pasta com este nome neste nível');
    }
    try {
      const updated = await this.prisma.requirementFolder.update({where:{id},data:{...(name!==undefined?{name}:{}),...(dto.parentId!==undefined?{parentId}:{}),...(dto.description!==undefined?{description:dto.description.trim()||null}:{})}});
      const operation = dto.parentId !== undefined && dto.parentId !== folder.parentId ? GoogleDriveOutboxOperation.MOVE_FOLDER : GoogleDriveOutboxOperation.UPDATE_FOLDER;
      await this.googleSync?.queueFolder(updated.id, operation);
      return updated;
    } catch (error) {
      if (this.isUniqueConstraint(error)) throw new ConflictException('Já existe uma pasta com este nome neste projeto');
      throw error;
    }
  }
  async deleteFolder(userId:string,projectId:string,id:string) {
    const folder=await this.prisma.requirementFolder.findFirst({where:{id,projectId}});
    if(!folder) throw new NotFoundException('Pasta não encontrada neste projeto');
    await this.project(userId,projectId,contentEditRoles);
    if(folder.name.localeCompare('Sem pasta', 'pt-BR', { sensitivity: 'base' }) === 0) throw new BadRequestException('A pasta Sem pasta não pode ser excluída');
    if (await this.prisma.requirementFolder.count({ where: { parentId: id } })) throw new ConflictException('Mova ou exclua as subpastas antes de excluir esta pasta');
    const moved = await this.prisma.requirement.findMany({ where: { folderId: id }, select: { id: true } });
    const mappings = await this.prisma.googleDriveFolderMapping.findMany({ where: { folderId: id }, select: { googleDriveFolderLinkId: true, externalId: true } });
    const pendingFolderWrites = await this.prisma.googleDriveOutbox.findMany({
      where: { folderId: id, operation: { in: [GoogleDriveOutboxOperation.CREATE_FOLDER, GoogleDriveOutboxOperation.UPDATE_FOLDER, GoogleDriveOutboxOperation.MOVE_FOLDER] }, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
      select: { googleDriveFolderLinkId: true },
    });
    await this.prisma.$transaction(async tx => {
      const fallback=await tx.requirementFolder.findFirst({where:{projectId:folder.projectId,name:{equals:'Sem pasta',mode:'insensitive'},parentId:null}});
      if(!fallback) throw new NotFoundException('Pasta Sem pasta não encontrada');
      await tx.requirement.updateMany({where:{folderId:id},data:{folderId:fallback.id}});
      await tx.requirementFolder.delete({where:{id}});
    });
    for (const requirement of moved) await this.googleSync?.queueRequirement(requirement.id, GoogleDriveOutboxOperation.MOVE);
    const cleanupTargets = new Map<string, string | null>(mappings.map((mapping: { googleDriveFolderLinkId: string; externalId: string }) => [mapping.googleDriveFolderLinkId, mapping.externalId]));
    for (const pending of pendingFolderWrites) if (!cleanupTargets.has(pending.googleDriveFolderLinkId)) cleanupTargets.set(pending.googleDriveFolderLinkId, null);
    for (const [linkId, externalId] of cleanupTargets) await this.googleSync?.queueDeletedFolder(id, linkId, externalId ?? undefined, moved.map(requirement => requirement.id));
    return {ok:true};
  }
  async workspace(userId:string,name:string) {
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    if (!normalizedName) throw new BadRequestException('O nome do workspace não pode ficar vazio');
    return this.prisma.workspace.create({data:{name:normalizedName,reviewChecklist:[...DEFAULT_REVIEW_CHECKLIST],members:{create:{userId,role:WorkspaceRole.OWNER}},folders:{create:{name:'Sem pasta',description:'Requisitos ainda não classificados'}}}});
  }
  async reviewChecklist(userId:string,workspaceId:string) {
    await this.member(userId,workspaceId);
    const workspace=await this.prisma.workspace.findUnique({where:{id:workspaceId},select:{reviewChecklist:true}});
    if(!workspace) throw new NotFoundException('Workspace não encontrado');
    const items=Array.isArray(workspace.reviewChecklist)?workspace.reviewChecklist.filter((item):item is string=>typeof item==='string'):[];
    return {items};
  }
  async updateReviewChecklist(userId:string,workspaceId:string,dto:UpdateReviewChecklistDto) {
    await this.member(userId,workspaceId,workspaceSettingsEditRoles);
    const items=dto.items.map(item=>item.trim());
    if(items.some(item=>!item)) throw new BadRequestException('Os itens do checklist não podem ficar vazios');
    const workspace=await this.prisma.workspace.update({where:{id:workspaceId},data:{reviewChecklist:items},select:{reviewChecklist:true}});
    const savedItems=Array.isArray(workspace.reviewChecklist)?workspace.reviewChecklist.filter((item):item is string=>typeof item==='string'):[];
    return {items:savedItems};
  }
  private async cloneFolderTree(tx: Prisma.TransactionClient, workspaceId: string, projectId: string, sourceProjectId: string | null) {
    const source = await tx.requirementFolder.findMany({ where: { workspaceId, projectId: sourceProjectId }, orderBy: { createdAt: 'asc' } });
    const pending = [...source];
    const copied = new Map<string, string>();
    while (pending.length) {
      const index = pending.findIndex(folder => !folder.parentId || copied.has(folder.parentId));
      if (index < 0) throw new ConflictException('A árvore de pastas existente contém uma referência inválida');
      const [folder] = pending.splice(index, 1);
      const created = await tx.requirementFolder.create({ data: { workspaceId, projectId, name: folder.name, description: folder.description, parentId: folder.parentId ? copied.get(folder.parentId) : null } });
      copied.set(folder.id, created.id);
    }
    if (!source.some(folder => folder.name.localeCompare('Sem pasta', 'pt-BR', { sensitivity: 'base' }) === 0 && folder.parentId === null)) {
      await tx.requirementFolder.create({ data: { workspaceId, projectId, name: 'Sem pasta', description: 'Requisitos ainda não classificados' } });
    }
    if (sourceProjectId === null) {
      // The workspace-level tree is a migration bridge for workspaces that
      // predate projects. Once copied into the first project, remove that
      // bridge from the active model (leaf-first because parent deletion is
      // restricted while children remain).
      for (;;) {
        const leaves = await tx.requirementFolder.findMany({
          where: { workspaceId, projectId: null, children: { none: {} } }, select: { id: true },
        });
        if (!leaves.length) break;
        await tx.requirementFolder.deleteMany({ where: { id: { in: leaves.map(folder => folder.id) } } });
      }
    }
  }

  async createProject(userId:string,workspaceId:string,name:string,key:string) {
    await this.member(userId,workspaceId,projectManagerRoles);
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    const normalizedKey = key.trim().toUpperCase();
    if (!normalizedName || !normalizedKey || !/^[A-Z0-9_-]+$/.test(normalizedKey) || normalizedKey.length > 16) {
      throw new BadRequestException('Informe um nome e uma chave válidos para o projeto');
    }
    try {
      return await this.prisma.$transaction(async tx => {
        const sourceProject = await tx.project.findFirst({ where: { workspaceId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } });
        const project = await tx.project.create({ data: { workspaceId, name: normalizedName, key: normalizedKey } });
        await this.cloneFolderTree(tx, workspaceId, project.id, sourceProject?.id ?? null);
        return project;
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) throw new ConflictException('Esta chave já está sendo usada neste workspace');
      throw error;
    }
  }

  private async pauseProjectIntegrations(tx: Prisma.TransactionClient, projectIds: string[], at = new Date()) {
    if (!projectIds.length) return;
    await Promise.all([
      tx.integrationProjectMapping.updateMany({ where: { projectId: { in: projectIds }, suspendedAt: null }, data: { suspendedAt: at } }),
      tx.googleDriveFolderLink.updateMany({
        where: { projectId: { in: projectIds }, suspendedAt: null },
        data: { suspendedAt: at, syncStatus: GoogleSyncStatus.IDLE, syncLeaseId: null, syncHeartbeatAt: null },
      }),
    ]);
  }

  private async resumeProjectIntegrations(tx: Prisma.TransactionClient, projectIds: string[], workspaceId: string) {
    if (!projectIds.length) return;
    await Promise.all([
      tx.integrationProjectMapping.updateMany({ where: { projectId: { in: projectIds }, suspendedAt: { not: null }, connection: { workspaceId } }, data: { suspendedAt: null } }),
      tx.googleDriveFolderLink.updateMany({ where: { projectId: { in: projectIds }, suspendedAt: { not: null }, connection: { workspaceId } }, data: { suspendedAt: null } }),
    ]);
  }

  private async deleteFoldersLeafFirst(tx: Prisma.TransactionClient, where: Prisma.RequirementFolderWhereInput) {
    for (;;) {
      const leaves = await tx.requirementFolder.findMany({ where: { ...where, children: { none: {} } }, select: { id: true } });
      if (!leaves.length) {
        if (await tx.requirementFolder.count({ where })) throw new ConflictException('A árvore de pastas contém uma referência circular e não pode ser excluída com segurança');
        return;
      }
      await tx.requirementFolder.deleteMany({ where: { id: { in: leaves.map(folder => folder.id) } } });
    }
  }

  private async assertConfirmationName(actual: string, confirmationName: string) {
    if (actual.trim() !== confirmationName.trim()) throw new BadRequestException('Digite o nome exato para confirmar a exclusão permanente');
  }

  async updateWorkspace(userId: string, workspaceId: string, dto: UpdateWorkspaceDto) {
    await this.member(userId, workspaceId, [WorkspaceRole.OWNER]);
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('O nome do workspace não pode ficar vazio');
    return this.prisma.workspace.update({ where: { id: workspaceId }, data: { name } });
  }

  async archiveWorkspace(userId: string, workspaceId: string) {
    await this.member(userId, workspaceId, [WorkspaceRole.OWNER]);
    return this.prisma.$transaction(async tx => {
      const projects = await tx.project.findMany({ where: { workspaceId }, select: { id: true } });
      const archived = await tx.workspace.update({ where: { id: workspaceId }, data: { archivedAt: new Date() } });
      await this.pauseProjectIntegrations(tx, projects.map(project => project.id));
      return archived;
    });
  }

  async restoreWorkspace(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (membership?.role !== WorkspaceRole.OWNER) throw new ForbiddenException('Você não tem permissão para esta ação');
    return this.prisma.$transaction(async tx => {
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace) throw new NotFoundException('Workspace não encontrado');
      if (!workspace.archivedAt) throw new BadRequestException('Este workspace já está ativo');
      const restored = await tx.workspace.update({ where: { id: workspaceId }, data: { archivedAt: null } });
      const projects = await tx.project.findMany({ where: { workspaceId, archivedAt: null }, select: { id: true } });
      await this.resumeProjectIntegrations(tx, projects.map(project => project.id), workspaceId);
      return restored;
    });
  }

  async permanentlyDeleteWorkspace(userId: string, workspaceId: string, dto: ConfirmDeleteDto) {
    await this.prisma.$transaction(async tx => {
      const membership = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
      if (membership?.role !== WorkspaceRole.OWNER) throw new ForbiddenException('Você não tem permissão para esta ação');
      const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
      if (!workspace) throw new NotFoundException('Workspace não encontrado');
      await this.assertConfirmationName(workspace.name, dto.confirmationName);
      const projects = await tx.project.findMany({ where: { workspaceId }, select: { id: true } });
      if (projects.length) await tx.requirement.deleteMany({ where: { projectId: { in: projects.map(project => project.id) } } });
      await tx.googleDriveFolderLink.deleteMany({ where: { connection: { workspaceId } } });
      await this.deleteFoldersLeafFirst(tx, { workspaceId });
      await tx.workspace.delete({ where: { id: workspaceId } });
    });
    return { ok: true };
  }

  async updateProject(userId: string, projectId: string, dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    await this.member(userId, project.workspaceId, projectManagerRoles);
    if (project.archivedAt) throw new BadRequestException('Restaure o projeto antes de editá-lo');
    const data: { name?: string; key?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim().replace(/\s+/g, ' ');
    if (dto.key !== undefined) data.key = dto.key.trim().toUpperCase();
    if (!Object.keys(data).length || (data.name !== undefined && !data.name) || (data.key !== undefined && !data.key)) {
      throw new BadRequestException('Informe um nome ou uma chave válida para o projeto');
    }
    try {
      return await this.prisma.project.update({ where: { id: projectId }, data });
    } catch (error) {
      if (this.isUniqueConstraint(error)) throw new ConflictException('Esta chave já está sendo usada neste workspace');
      throw error;
    }
  }

  async archiveProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    await this.member(userId, project.workspaceId, projectManagerRoles);
    if (project.archivedAt) throw new BadRequestException('Este projeto já está arquivado');
    return this.prisma.$transaction(async tx => {
      const archived = await tx.project.update({ where: { id: projectId }, data: { archivedAt: new Date() } });
      await this.pauseProjectIntegrations(tx, [projectId]);
      return archived;
    });
  }

  async restoreProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    await this.member(userId, project.workspaceId, projectManagerRoles);
    if (!project.archivedAt) throw new BadRequestException('Este projeto já está ativo');
    const workspace = await this.prisma.workspace.findUnique({ where: { id: project.workspaceId }, select: { archivedAt: true } });
    if (!workspace || workspace.archivedAt) throw new BadRequestException('Restaure o workspace antes do projeto');
    return this.prisma.$transaction(async tx => {
      const restored = await tx.project.update({ where: { id: projectId }, data: { archivedAt: null } });
      await this.resumeProjectIntegrations(tx, [projectId], project.workspaceId);
      return restored;
    });
  }

  async permanentlyDeleteProject(userId: string, projectId: string, dto: ConfirmDeleteDto) {
    await this.prisma.$transaction(async tx => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundException('Projeto não encontrado');
      await this.memberOnTransaction(tx, userId, project.workspaceId, projectManagerRoles);
      if (!project.archivedAt) throw new BadRequestException('Arquive o projeto antes de excluí-lo permanentemente');
      await this.assertConfirmationName(project.name, dto.confirmationName);
      await tx.requirement.deleteMany({ where: { projectId } });
      // The project relation on Drive links uses SetNull for ordinary project moves;
      // permanent deletion must also remove the local link and its local sync history.
      await tx.googleDriveFolderLink.deleteMany({ where: { projectId } });
      await this.deleteFoldersLeafFirst(tx, { projectId });
      await tx.project.delete({ where: { id: projectId } });
    });
    return { ok: true };
  }

  async moveProject(userId: string, projectId: string, dto: MoveProjectDto) {
    const current = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!current) throw new NotFoundException('Projeto não encontrado');
    await this.member(userId, current.workspaceId, [WorkspaceRole.OWNER]);
    if (current.workspaceId === dto.targetWorkspaceId) throw new BadRequestException('O projeto já pertence a este workspace');
    const target = await this.prisma.workspace.findUnique({ where: { id: dto.targetWorkspaceId }, select: { id: true, name: true, archivedAt: true } });
    if (!target) throw new NotFoundException('Workspace de destino não encontrado');
    await this.member(userId, target.id, [WorkspaceRole.OWNER]);
    if (current.archivedAt) throw new BadRequestException('Restaure o projeto antes de movê-lo');
    if (target.archivedAt) throw new BadRequestException('Restaure o workspace de destino antes de mover o projeto');
    const key = (dto.key ?? current.key).trim().toUpperCase();
    if (!key) throw new BadRequestException('A chave do projeto não pode ficar vazia');

    try {
      return await this.prisma.$transaction(async tx => {
        await this.memberOnTransaction(tx, userId, current.workspaceId, [WorkspaceRole.OWNER]);
        await this.memberOnTransaction(tx, userId, target.id, [WorkspaceRole.OWNER]);
        const project = await tx.project.findUnique({ where: { id: projectId } });
        if (!project || project.archivedAt || project.workspaceId !== current.workspaceId) throw new ConflictException('O projeto mudou enquanto você preparava a transferência');
        const duplicate = await tx.project.findFirst({ where: { workspaceId: target.id, key, id: { not: projectId } }, select: { id: true } });
        if (duplicate) throw new ConflictException('Esta chave já está sendo usada no workspace de destino');

        const [mappingCount, folderLinkCount, fromMembers, toMembers, directMembers] = await Promise.all([
          tx.integrationProjectMapping.count({ where: { projectId } }),
          tx.googleDriveFolderLink.count({ where: { projectId } }),
          tx.workspaceMember.count({ where: { workspaceId: current.workspaceId } }),
          tx.workspaceMember.count({ where: { workspaceId: target.id } }),
          tx.projectMember.count({ where: { projectId } }),
        ]);
        const needsReconnect = mappingCount + folderLinkCount > 0;
        if (needsReconnect) await this.pauseProjectIntegrations(tx, [projectId]);
        await tx.requirementFolder.updateMany({ where: { projectId }, data: { workspaceId: target.id } });
        await tx.accessRequest.updateMany({ where: { projectId }, data: { workspaceId: target.id } });
        const moved = await tx.project.update({ where: { id: projectId }, data: { workspaceId: target.id, key } });
        return {
          ...moved,
          accessImpact: {
            fromWorkspace: current.workspaceId,
            toWorkspace: target.id,
            sourceWorkspaceMembersLoseInheritedAccess: fromMembers,
            destinationWorkspaceMembersGainInheritedAccess: toMembers,
            directProjectMembersRetained: directMembers,
            integrationsRequireReconnect: needsReconnect,
          },
        };
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) throw new ConflictException('Esta chave já está sendo usada no workspace de destino');
      throw error;
    }
  }

  async members(userId:string, workspaceId:string) {
    await this.member(userId,workspaceId,[WorkspaceRole.OWNER]);
    return this.prisma.workspaceMember.findMany({where:{workspaceId},orderBy:{user:{name:'asc'}},select:{role:true,user:{select:{id:true,name:true,email:true}}}});
  }
  async participants(userId:string, workspaceId:string) {
    await this.member(userId,workspaceId);
    return this.prisma.workspaceMember.findMany({where:{workspaceId},orderBy:{user:{name:'asc'}},select:{user:{select:{id:true,name:true}}}}).then(rows=>rows.map(row=>row.user));
  }
  async projectParticipants(userId:string, projectId:string) {
    const access=await requireProjectAccess(this.prisma,userId,projectId);
    if(access.scope==='WORKSPACE') return this.prisma.workspaceMember.findMany({where:{workspaceId:access.project.workspaceId},orderBy:{user:{name:'asc'}},select:{user:{select:{id:true,name:true}}}}).then(rows=>rows.map(row=>row.user));
    return this.prisma.projectMember.findMany({where:{projectId},orderBy:{user:{name:'asc'}},select:{user:{select:{id:true,name:true}}}}).then(rows=>rows.map(row=>row.user));
  }
  async addMember(userId:string,workspaceId:string,dto:AddWorkspaceMemberDto) {
    const result=await this.ownerMembershipTransaction(async tx=>{
      await this.memberOnTransaction(tx, userId, workspaceId, [WorkspaceRole.OWNER]);
      const user=await tx.user.findUnique({where:{email:dto.email.trim().toLowerCase()},select:{id:true,name:true,email:true}});
      if(!user) throw new NotFoundException('Não existe uma conta cadastrada com este e-mail');
      const target=await tx.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId,userId:user.id}}});
      if (target?.role===WorkspaceRole.OWNER && dto.role!==WorkspaceRole.OWNER) {
        const ownerCount=await tx.workspaceMember.count({where:{workspaceId,role:WorkspaceRole.OWNER}});
        if (ownerCount<=1) throw new BadRequestException('O workspace precisa manter ao menos um owner');
      }
      const membership=await tx.workspaceMember.upsert({where:{workspaceId_userId:{workspaceId,userId:user.id}},create:{workspaceId,userId:user.id,role:dto.role},update:{role:dto.role},select:{role:true}});
      await tx.projectMember.deleteMany({where:{userId:user.id,project:{workspaceId}}});
      return { membership, user };
    });
    return {...result.membership,user:result.user};
  }
  async updateMember(userId:string,workspaceId:string,memberUserId:string,dto:UpdateWorkspaceMemberDto) {
    return this.ownerMembershipTransaction(async tx=>{
      await this.memberOnTransaction(tx, userId, workspaceId, [WorkspaceRole.OWNER]);
      const target=await tx.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId,userId:memberUserId}}});
      if(!target) throw new NotFoundException('Membro não encontrado');
      if(target.role===WorkspaceRole.OWNER && dto.role!==WorkspaceRole.OWNER) {
        const ownerCount=await tx.workspaceMember.count({where:{workspaceId,role:WorkspaceRole.OWNER}});
        if(ownerCount<=1) throw new BadRequestException('O workspace precisa manter ao menos um owner');
      }
      const updated=await tx.workspaceMember.update({where:{workspaceId_userId:{workspaceId,userId:memberUserId}},data:{role:dto.role}});
      await tx.projectMember.deleteMany({where:{userId:memberUserId,project:{workspaceId}}});
      return updated;
    });
  }
  async removeMember(userId:string,workspaceId:string,memberUserId:string) {
    return this.ownerMembershipTransaction(async tx=>{
      await this.memberOnTransaction(tx, userId, workspaceId, [WorkspaceRole.OWNER]);
      const target=await tx.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId,userId:memberUserId}}});
      if(!target) throw new NotFoundException('Membro não encontrado');
      if(target.role===WorkspaceRole.OWNER) {
        const ownerCount=await tx.workspaceMember.count({where:{workspaceId,role:WorkspaceRole.OWNER}});
        if(ownerCount<=1) throw new BadRequestException('O workspace precisa manter ao menos um owner');
      }
      const removed=await tx.workspaceMember.delete({where:{workspaceId_userId:{workspaceId,userId:memberUserId}}});
      await tx.projectMember.deleteMany({where:{userId:memberUserId,project:{workspaceId}}});
      return removed;
    });
  }

  async templates(userId:string,workspaceId:string) { await this.member(userId,workspaceId); return this.prisma.documentTemplate.findMany({where:{workspaceId},orderBy:{updatedAt:'desc'}}); }
  async template(userId:string,id:string) { const template=await this.prisma.documentTemplate.findUnique({where:{id}}); if(!template) throw new NotFoundException('Template não encontrado'); await this.member(userId,template.workspaceId); return template; }
  async createTemplate(userId:string,workspaceId:string,dto:CreateTemplateDto) {
    await this.member(userId,workspaceId,workspaceSettingsEditRoles);
    return this.prisma.documentTemplate.create({data:{workspaceId,createdById:userId,name:dto.name,description:dto.description,content:dto.content as Prisma.InputJsonValue,acceptanceCriteria:dto.acceptanceCriteria as unknown as Prisma.InputJsonValue}});
  }
  async updateTemplate(userId:string,id:string,dto:UpdateTemplateDto) {
    const template=await this.template(userId,id); await this.member(userId,template.workspaceId,workspaceSettingsEditRoles);
    return this.prisma.documentTemplate.update({where:{id},data:{name:dto.name,description:dto.description,content:dto.content as Prisma.InputJsonValue,acceptanceCriteria:dto.acceptanceCriteria as unknown as Prisma.InputJsonValue}});
  }
  async deleteTemplate(userId:string,id:string) { const template=await this.template(userId,id); await this.member(userId,template.workspaceId,workspaceSettingsEditRoles); return this.prisma.documentTemplate.delete({where:{id}}); }

  async references(userId:string, requirementId:string) { await this.requirement(userId,requirementId); return this.prisma.requirementReference.findMany({where:{requirementId},orderBy:{position:'asc'}}); }

  /**
   * The public endpoint is retained as a compatibility boundary, but manual
   * creation is a product-disabled operation. New references must come from
   * an approved AI suggestion through approveReference below.
   */
  async createReference(_userId:string, _requirementId:string, _dto?:CreateReferenceDto) {
    throw new ConflictException({
      code: 'MANUAL_REFERENCE_CREATION_DISABLED',
      message: 'A criação de novas referências não está disponível',
    });
  }

  /** Internal application path for a future AI-suggestion approval flow. */
  async approveReference(userId:string, requirementId:string, dto:CreateReferenceDto) {
    await this.requirement(userId, requirementId, contentEditRoles);
    if (!dto || !['PROTOTYPE', 'ATTACHMENT'].includes(dto.type) || typeof dto.name !== 'string' || !dto.name.trim() || dto.name.length > 240) {
      throw new BadRequestException('Dados de referência inválidos');
    }
    if (!this.validUrl(dto.url)) throw new BadRequestException('A referência deve usar http, https ou mailto');
    return this.prisma.requirementReference.create({data:{requirementId,type:dto.type,name:dto.name,url:dto.url,position:dto.position??0}});
  }
  async deleteReference(userId:string,requirementId:string,referenceId:string) { await this.requirement(userId,requirementId,contentEditRoles); const reference=await this.prisma.requirementReference.findFirst({where:{id:referenceId,requirementId}}); if(!reference) throw new NotFoundException('Referência não encontrada'); return this.prisma.requirementReference.delete({where:{id:referenceId}}); }

  private assertAnchor(anchor:Record<string,unknown>) { const {from,to,quote}=anchor; if(!Number.isInteger(from)||!Number.isInteger(to)||(from as number)<0||(to as number)<(from as number)||typeof quote!=='string'||quote.length>5000) throw new BadRequestException('Âncora de comentário inválida'); }
  private async assertMentionMembers(projectId:string, workspaceId:string, ids:string[], authorId:string) {
    const unique=[...new Set(ids)].filter(id=>id!==authorId); if(!unique.length) return unique;
    const count=await this.prisma.user.count({where:{id:{in:unique},OR:[{memberships:{some:{workspaceId}}},{projectMemberships:{some:{projectId}}}]}});
    if(count!==unique.length) throw new BadRequestException('Uma ou mais menções não pertencem ao workspace');
    return unique;
  }
  private commentInclude = { author:{select:{id:true,name:true,email:true}}, resolvedBy:{select:{id:true,name:true}}, messages:{orderBy:{createdAt:'asc' as const},include:{author:{select:{id:true,name:true,email:true}}}} };
  async comments(userId:string,requirementId:string) { await this.requirement(userId,requirementId); return this.prisma.commentThread.findMany({where:{requirementId},orderBy:{createdAt:'asc'},include:this.commentInclude}); }
  async createComment(userId:string,requirementId:string,dto:CreateCommentDto) {
    const requirement=await this.requirement(userId,requirementId,commentRoles); if(dto.anchor) this.assertAnchor(dto.anchor);
    if (requirement.status === 'ARCHIVED' || requirement.archivedAt) throw new BadRequestException('US cancelada está em modo somente leitura');
    const project=await this.project(userId,requirement.projectId); const mentions=await this.assertMentionMembers(project.id,project.workspaceId,dto.mentionedUserIds??[],userId);
    try { return await this.prisma.$transaction(async tx=>{
        const thread=await tx.commentThread.create({data:{requirementId,authorId:userId,...(dto.anchor ? {anchor:dto.anchor as Prisma.InputJsonValue} : {}),messages:{create:{authorId:userId,body:dto.body,mentionedUserIds:mentions}}},include:{messages:true}});
        if(mentions.length) await tx.notification.createMany({data:mentions.map(mentionedUserId=>({userId:mentionedUserId,type:'MENTION',commentMessageId:thread.messages[0].id}))});
        return tx.commentThread.findUniqueOrThrow({where:{id:thread.id},include:this.commentInclude});
      }); } catch (error) { this.logger.error(`comment creation failed requirement=${requirementId} user=${userId}`, error instanceof Error ? error.stack : undefined); throw error; }
  }
  private async commentThreadAccess(userId:string,threadId:string,allowed:WorkspaceRole[]=readRoles) {
    const thread=await this.prisma.commentThread.findUnique({where:{id:threadId},include:{requirement:{select:{projectId:true,status:true,archivedAt:true}}}}); if(!thread) throw new NotFoundException('Comentário não encontrado');
    const project=await this.project(userId,thread.requirement.projectId,allowed); return {thread,project};
  }
  async replyComment(userId:string,threadId:string,dto:CreateCommentReplyDto) {
    const {thread,project}=await this.commentThreadAccess(userId,threadId,commentRoles); const mentions=await this.assertMentionMembers(project.id,project.workspaceId,dto.mentionedUserIds??[],userId);
    if (thread.requirement.status === 'ARCHIVED' || thread.requirement.archivedAt) throw new BadRequestException('US cancelada está em modo somente leitura');
    try { return await this.prisma.$transaction(async tx=>{ const message=await tx.commentMessage.create({data:{threadId,authorId:userId,body:dto.body,mentionedUserIds:mentions},include:{author:{select:{id:true,name:true,email:true}}}}); if(mentions.length) await tx.notification.createMany({data:mentions.map(mentionedUserId=>({userId:mentionedUserId,type:'MENTION',commentMessageId:message.id}))}); return message; }); } catch (error) { this.logger.error(`comment reply failed thread=${threadId} user=${userId}`, error instanceof Error ? error.stack : undefined); throw error; }
  }
  async setCommentResolution(userId:string,threadId:string,resolved:boolean) {
    const {thread,project}=await this.commentThreadAccess(userId,threadId); const access=await requireProjectAccess(this.prisma,userId,project.id);
    if (thread.requirement.status === 'ARCHIVED' || thread.requirement.archivedAt) throw new BadRequestException('US cancelada está em modo somente leitura');
    if(thread.authorId!==userId && !['OWNER','MANAGER','EDITOR'].includes(String(access.role))) throw new ForbiddenException('Apenas o autor, editor, gerente ou owner pode resolver comentários');
    return this.prisma.commentThread.update({where:{id:threadId},data:resolved?{status:'RESOLVED',resolvedAt:new Date(),resolvedById:userId}:{status:'OPEN',resolvedAt:null,resolvedById:null},include:this.commentInclude});
  }
  async notifications(userId:string) {
    const [accessibleProjects, managementMemberships, rows] = await Promise.all([
      this.prisma.project.findMany({where:{OR:[{workspace:{members:{some:{userId}}}},{members:{some:{userId}}}]},select:{id:true}}),
      this.prisma.workspaceMember.findMany({where:{userId,role:{in:[WorkspaceRole.OWNER,WorkspaceRole.MANAGER]}},select:{workspaceId:true}}),
      this.prisma.notification.findMany({where:{userId},orderBy:{createdAt:'desc'},include:{commentMessage:{include:{thread:{include:{requirement:{select:{id:true,title:true,projectId:true}}}},author:{select:{id:true,name:true}}}},accessRequest:{include:{requester:{select:{id:true,name:true,email:true}},project:{select:{id:true,name:true,key:true}},workspace:{select:{id:true,name:true}}}}}}),
    ]);
    const projects = new Set(accessibleProjects.map(item=>item.id));
    const managedWorkspaces = new Set(managementMemberships.map(item=>item.workspaceId));
    return rows.filter(notification => {
      const projectId = notification.commentMessage?.thread.requirement.projectId;
      if (projectId && !projects.has(projectId)) return false;
      if (notification.type === 'ACCESS_REQUEST' && notification.accessRequest) return managedWorkspaces.has(notification.accessRequest.workspaceId);
      return true;
    });
  }
  async readNotification(userId:string,id:string) { const notification=await this.prisma.notification.findFirst({where:{id,userId}}); if(!notification) throw new NotFoundException('Notificação não encontrada'); return this.prisma.notification.update({where:{id},data:{readAt:new Date()}}); }
}
