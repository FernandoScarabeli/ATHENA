import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GoogleDriveOutboxOperation, Prisma, RelationType, RequirementType, WorkspaceRole } from '@prisma/client';
import { AddWorkspaceMemberDto, CreateCommentDto, CreateCommentReplyDto, CreateFolderDto, CreateProjectDto, CreateReferenceDto, CreateRelationDto, CreateRequirementDto, CreateTemplateDto, CreateWorkspaceDto, UpdateFolderDto, UpdateRequirementDto, UpdateTemplateDto, UpdateWorkspaceMemberDto } from './dto';
import { PrismaService } from '../core/prisma.service';
import { AiAnalysisJobService } from '../ai/ai-analysis-job.service';
import { GoogleSyncService } from '../integrations/google-sync.service';

const include = { criteria:{orderBy:{position:'asc' as const}}, references:{orderBy:{position:'asc' as const}}, folder:true };
const readRoles: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER];
const editRoles: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.EDITOR];
const commentRoles = readRoles;
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
  constructor(private prisma:PrismaService, private readonly aiJobs?: AiAnalysisJobService, private readonly googleSync?: GoogleSyncService) {}

  private async member(userId:string, workspaceId:string, allowed: WorkspaceRole[] = readRoles) {
    const member = await this.prisma.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId,userId}}});
    if (!member || !allowed.includes(member.role)) throw new ForbiddenException('Você não tem permissão para esta ação');
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
    return member;
  }

  async project(userId:string, projectId:string, allowed: WorkspaceRole[] = readRoles) {
    const project=await this.prisma.project.findUnique({where:{id:projectId}});
    if(!project) throw new NotFoundException('Projeto não encontrado');
    await this.member(userId, project.workspaceId, allowed);
    return project;
  }
  async requirement(userId:string,id:string, allowed: WorkspaceRole[] = readRoles) {
    const requirement=await this.prisma.requirement.findUnique({where:{id},include});
    if(!requirement) throw new NotFoundException('Requisito não encontrado');
    await this.project(userId, requirement.projectId, allowed);
    return requirement;
  }

  async create(userId:string,projectId:string,dto:CreateRequirementDto) {
    const project = await this.project(userId,projectId,editRoles);
    let template: { content: unknown; acceptanceCriteria: unknown } | null = null;
    if (dto.templateId) {
      template = await this.prisma.documentTemplate.findFirst({where:{id:dto.templateId,workspaceId:project.workspaceId},select:{content:true,acceptanceCriteria:true}});
      if (!template) throw new NotFoundException('Template não encontrado neste workspace');
    }
    const templateCriteria = Array.isArray(template?.acceptanceCriteria) ? template!.acceptanceCriteria as CriterionInput[] : [];
    const content = Object.keys(dto.content ?? {}).length ? dto.content : (template?.content ?? dto.content);
    // An omitted criteria field means “use the template”; an explicit empty
    // array is intentional and must create a requirement without criteria.
    const criteria = dto.acceptanceCriteria ?? templateCriteria;
    const folder = await this.prisma.requirementFolder.findFirst({where:{id:dto.folderId,workspaceId:project.workspaceId}});
    if (!folder) throw new NotFoundException('Pasta não encontrada neste workspace');
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
    void this.googleSync?.queueRequirement(created.id, GoogleDriveOutboxOperation.CREATE);
    return created;
  }
  async list(userId:string,projectId:string,status:'active'|'archived' = 'active') {
    await this.project(userId,projectId);
    if (status !== 'active' && status !== 'archived') throw new BadRequestException('Status de requisito inválido');
    return this.prisma.requirement.findMany({where:{projectId,...(status === 'archived' ? { archivedAt:{ not:null } } : { archivedAt:null })},include,orderBy:{updatedAt:'desc'}});
  }
  async workspaces(userId:string) {
    const memberships=await this.prisma.workspaceMember.findMany({where:{userId},select:{role:true,workspace:{select:{id:true,name:true,projects:{select:{id:true,name:true,key:true},orderBy:{name:'asc'}}}}}});
    return memberships.map(({role,workspace})=>({...workspace,role})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  }
  async update(userId:string,id:string,dto:UpdateRequirementDto) {
    const current=await this.requirement(userId,id,editRoles);
    if (current.archivedAt || current.status==='ARCHIVED') throw new BadRequestException('US arquivada não aceita edição');
    if(current.revision!==dto.revision) throw new ConflictException({code:'REQUIREMENT_REVISION_CONFLICT',message:'O requisito foi alterado por outra pessoa',details:{currentRevision:current.revision}});
    const {revision,acceptanceCriteria,...data}=dto;
    if (data.folderId) {
      const project=await this.prisma.project.findUniqueOrThrow({where:{id:current.projectId},select:{workspaceId:true}});
      const folder=await this.prisma.requirementFolder.findFirst({where:{id:data.folderId,workspaceId:project.workspaceId}});
      if (!folder) throw new NotFoundException('Pasta não encontrada neste workspace');
    }
    const wasDraft = current.status === 'DRAFT';
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
    if (wasDraft && updated.status === 'ACTIVE') void this.aiJobs?.start(updated.projectId);
    void this.googleSync?.queueRequirement(updated.id, data.folderId && data.folderId !== current.folderId ? GoogleDriveOutboxOperation.MOVE : GoogleDriveOutboxOperation.UPDATE);
    return updated;
  }
  async archive(userId:string,id:string) {
    const requirement=await this.requirement(userId,id,editRoles);
    const archivedRequirement = await this.prisma.$transaction(async tx=>{
      // updateMany makes cancellation idempotent and prevents a repeated request
      // from creating another activity entry or touching already preserved data.
      const archived=await tx.requirement.updateMany({where:{id:requirement.id,archivedAt:null},data:{status:'ARCHIVED',archivedAt:new Date()}});
      if (archived.count === 0) return tx.requirement.findUniqueOrThrow({where:{id:requirement.id},include});
      await tx.requirementRelation.deleteMany({where:{OR:[{sourceId:id},{targetId:id}]}});
      await tx.activityLog.create({data:{userId,projectId:requirement.projectId,action:'REQUIREMENT_ARCHIVED',entityId:id}});
      return tx.requirement.findUniqueOrThrow({where:{id:requirement.id},include});
    });
    void this.googleSync?.queueRequirement(archivedRequirement.id, GoogleDriveOutboxOperation.ARCHIVE);
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
    const source=await this.requirement(userId,id,editRoles),target=await this.requirement(userId,dto.targetId,editRoles);
    if (source.status==='ARCHIVED' || target.status==='ARCHIVED') throw new BadRequestException('US cancelada não pode possuir relações');
    if(source.projectId!==target.projectId) throw new BadRequestException('Relações precisam pertencer ao mesmo projeto');
    if(id===dto.targetId) throw new BadRequestException('Autorrelação não permitida');
    const reverse=await this.prisma.requirementRelation.findFirst({where:{sourceId:dto.targetId,targetId:id,type:dto.type as RelationType}});
    if(reverse&&dto.type==='RELATED_TO') throw new ConflictException('Relação equivalente já existe');
    try {
      const created = await this.prisma.requirementRelation.create({data:{sourceId:id,targetId:dto.targetId,type:dto.type as RelationType}});
      if (dto.type === 'DEPENDS_ON') await this.prisma.aiSuggestion.deleteMany({ where: { requirementId: id, targetRequirementId: dto.targetId, relationType: RelationType.DEPENDS_ON, status: 'DISMISSED' } });
      return created;
    } catch (error) {
      if (this.isRelationConflict(error)) throw new ConflictException('Esta relação já existe');
      throw error;
    }
  }
  async relations(userId:string,id:string) { await this.requirement(userId,id); return this.prisma.requirementRelation.findMany({where:{OR:[{sourceId:id},{targetId:id}]},include:{source:true,target:true}}); }
  async removeRelation(userId:string, requirementId:string, relationId:string) {
    await this.requirement(userId,requirementId,editRoles);
    const relation=await this.prisma.requirementRelation.findFirst({where:{id:relationId,OR:[{sourceId:requirementId},{targetId:requirementId}]}});
    if(!relation) throw new NotFoundException('Relação não encontrada');
    return this.prisma.$transaction(async tx => {
      const deleted = await tx.requirementRelation.delete({where:{id:relationId}});
      if (deleted.type === RelationType.DEPENDS_ON) await tx.aiSuggestion.create({ data: { requirementId: deleted.sourceId, targetRequirementId: deleted.targetId, type: 'RELATION', relationType: RelationType.DEPENDS_ON, justification: 'Dependência removida manualmente', status: 'DISMISSED' } });
      return deleted;
    });
  }
  async graph(userId:string,projectId:string) { await this.project(userId,projectId); const requirements=await this.prisma.requirement.findMany({where:{projectId,archivedAt:null},select:{id:true,code:true,title:true,type:true,status:true}}); const ids=requirements.map(requirement=>requirement.id); const edges=await this.prisma.requirementRelation.findMany({where:{sourceId:{in:ids},targetId:{in:ids}}}); return {nodes:requirements,edges:edges.map(edge=>({id:edge.id,source:edge.sourceId,target:edge.targetId,type:edge.type}))}; }
  async folders(userId:string,workspaceId:string) { await this.member(userId,workspaceId); return this.prisma.requirementFolder.findMany({where:{workspaceId},orderBy:{name:'asc'},include:{_count:{select:{requirements:{where:{archivedAt:null}}}}}}).then(folders=>folders.map(folder=>({...folder,requirementCount:folder._count.requirements,_count:undefined}))); }
  async createFolder(userId:string,workspaceId:string,dto:CreateFolderDto) {
    await this.member(userId,workspaceId,editRoles);
    const name = this.assertEditableFolderName(dto.name);
    if (dto.parentId) { const parent = await this.prisma.requirementFolder.findFirst({ where: { id: dto.parentId, workspaceId } }); if (!parent) throw new NotFoundException('Pasta pai não encontrada neste workspace'); }
    const duplicate = await this.prisma.requirementFolder.findFirst({ where: { workspaceId, parentId: dto.parentId ?? null, name: { equals: name, mode: 'insensitive' } } });
    if (duplicate) throw new ConflictException('Já existe uma pasta com este nome neste nível');
    try {
      return await this.prisma.requirementFolder.create({data:{workspaceId,name,parentId:dto.parentId ?? null,description:dto.description?.trim()||null}});
    } catch (error) {
      if (this.isUniqueConstraint(error)) throw new ConflictException('Já existe uma pasta com este nome neste workspace');
      throw error;
    }
  }
  async updateFolder(userId:string,id:string,dto:UpdateFolderDto) {
    const folder=await this.prisma.requirementFolder.findUnique({where:{id}});
    if(!folder) throw new NotFoundException('Pasta não encontrada');
    await this.member(userId,folder.workspaceId,editRoles);
    if (folder.name.localeCompare('Sem pasta', 'pt-BR', { sensitivity: 'base' }) === 0) {
      if (dto.name !== undefined) throw new BadRequestException('A pasta Sem pasta é reservada e não pode ser renomeada');
    }
    const name = dto.name === undefined ? undefined : this.assertEditableFolderName(dto.name);
    const parentId = dto.parentId === undefined ? folder.parentId : dto.parentId;
    if (parentId) {
      if (parentId === id) throw new BadRequestException('Uma pasta não pode ser pai de si mesma');
      let parent = await this.prisma.requirementFolder.findFirst({ where: { id: parentId, workspaceId: folder.workspaceId } });
      if (!parent) throw new NotFoundException('Pasta pai não encontrada neste workspace');
      const seen = new Set<string>();
      while (parent) { if (parent.id === id || seen.has(parent.id)) throw new BadRequestException('A pasta pai criaria um ciclo'); seen.add(parent.id); parent = parent.parentId ? await this.prisma.requirementFolder.findUnique({ where: { id: parent.parentId } }) : null; }
    }
    if (name !== undefined) {
      const duplicate = await this.prisma.requirementFolder.findFirst({ where: { workspaceId: folder.workspaceId, parentId, name: { equals: name, mode: 'insensitive' }, NOT: { id } } });
      if (duplicate) throw new ConflictException('Já existe uma pasta com este nome neste nível');
    }
    try {
      return await this.prisma.requirementFolder.update({where:{id},data:{...(name!==undefined?{name}:{}),...(dto.parentId!==undefined?{parentId}:{}),...(dto.description!==undefined?{description:dto.description.trim()||null}:{})}});
    } catch (error) {
      if (this.isUniqueConstraint(error)) throw new ConflictException('Já existe uma pasta com este nome neste workspace');
      throw error;
    }
  }
  async deleteFolder(userId:string,id:string) {
    const folder=await this.prisma.requirementFolder.findUnique({where:{id}});
    if(!folder) throw new NotFoundException('Pasta não encontrada');
    await this.member(userId,folder.workspaceId,editRoles);
    if(folder.name.localeCompare('Sem pasta', 'pt-BR', { sensitivity: 'base' }) === 0) throw new BadRequestException('A pasta Sem pasta não pode ser excluída');
    if (await this.prisma.requirementFolder.count({ where: { parentId: id } })) throw new ConflictException('Mova ou exclua as subpastas antes de excluir esta pasta');
    await this.prisma.$transaction(async tx => {
      const fallback=await tx.requirementFolder.findFirst({where:{workspaceId:folder.workspaceId,name:{equals:'Sem pasta',mode:'insensitive'}}});
      if(!fallback) throw new NotFoundException('Pasta Sem pasta não encontrada');
      await tx.requirement.updateMany({where:{folderId:id},data:{folderId:fallback.id}});
      await tx.requirementFolder.delete({where:{id}});
    });
    return {ok:true};
  }
  async workspace(userId:string,name:string) { return this.prisma.workspace.create({data:{name,members:{create:{userId,role:WorkspaceRole.OWNER}},folders:{create:{name:'Sem pasta',description:'Requisitos ainda não classificados'}}}}); }
  async createProject(userId:string,workspaceId:string,name:string,key:string) { await this.member(userId,workspaceId,[WorkspaceRole.OWNER]); const fallback=await this.prisma.requirementFolder.findFirst({where:{workspaceId,name:'Sem pasta'}}); if(!fallback) await this.prisma.requirementFolder.create({data:{workspaceId,name:'Sem pasta',description:'Requisitos ainda não classificados'}}); return this.prisma.project.create({data:{workspaceId,name,key:key.toUpperCase()}}); }

  async members(userId:string, workspaceId:string) {
    await this.member(userId,workspaceId,[WorkspaceRole.OWNER]);
    return this.prisma.workspaceMember.findMany({where:{workspaceId},orderBy:{user:{name:'asc'}},select:{role:true,user:{select:{id:true,name:true,email:true}}}});
  }
  async participants(userId:string, workspaceId:string) {
    await this.member(userId,workspaceId);
    return this.prisma.workspaceMember.findMany({where:{workspaceId},orderBy:{user:{name:'asc'}},select:{user:{select:{id:true,name:true}}}}).then(rows=>rows.map(row=>row.user));
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
      return tx.workspaceMember.update({where:{workspaceId_userId:{workspaceId,userId:memberUserId}},data:{role:dto.role}});
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
      return tx.workspaceMember.delete({where:{workspaceId_userId:{workspaceId,userId:memberUserId}}});
    });
  }

  async templates(userId:string,workspaceId:string) { await this.member(userId,workspaceId); return this.prisma.documentTemplate.findMany({where:{workspaceId},orderBy:{updatedAt:'desc'}}); }
  async template(userId:string,id:string) { const template=await this.prisma.documentTemplate.findUnique({where:{id}}); if(!template) throw new NotFoundException('Template não encontrado'); await this.member(userId,template.workspaceId); return template; }
  async createTemplate(userId:string,workspaceId:string,dto:CreateTemplateDto) {
    await this.member(userId,workspaceId,editRoles);
    return this.prisma.documentTemplate.create({data:{workspaceId,createdById:userId,name:dto.name,description:dto.description,content:dto.content as Prisma.InputJsonValue,acceptanceCriteria:dto.acceptanceCriteria as unknown as Prisma.InputJsonValue}});
  }
  async updateTemplate(userId:string,id:string,dto:UpdateTemplateDto) {
    const template=await this.template(userId,id); await this.member(userId,template.workspaceId,editRoles);
    return this.prisma.documentTemplate.update({where:{id},data:{name:dto.name,description:dto.description,content:dto.content as Prisma.InputJsonValue,acceptanceCriteria:dto.acceptanceCriteria as unknown as Prisma.InputJsonValue}});
  }
  async deleteTemplate(userId:string,id:string) { const template=await this.template(userId,id); await this.member(userId,template.workspaceId,editRoles); return this.prisma.documentTemplate.delete({where:{id}}); }

  async references(userId:string, requirementId:string) { await this.requirement(userId,requirementId); return this.prisma.requirementReference.findMany({where:{requirementId},orderBy:{position:'asc'}}); }

  /**
   * The public endpoint is retained as a compatibility boundary, but manual
   * creation is a product-disabled operation. New references must come from
   * an approved AI suggestion through approveReference below.
   */
  async createReference(_userId:string, _requirementId:string, _dto?:CreateReferenceDto) {
    throw new ConflictException({
      code: 'MANUAL_REFERENCE_CREATION_DISABLED',
      message: 'Novas referências devem ser criadas pela aprovação de uma sugestão de IA',
    });
  }

  /** Internal application path for a future AI-suggestion approval flow. */
  async approveReference(userId:string, requirementId:string, dto:CreateReferenceDto) {
    await this.requirement(userId, requirementId, editRoles);
    if (!dto || !['PROTOTYPE', 'ATTACHMENT'].includes(dto.type) || typeof dto.name !== 'string' || !dto.name.trim() || dto.name.length > 240) {
      throw new BadRequestException('Dados de referência inválidos');
    }
    if (!this.validUrl(dto.url)) throw new BadRequestException('A referência deve usar http, https ou mailto');
    return this.prisma.requirementReference.create({data:{requirementId,type:dto.type,name:dto.name,url:dto.url,position:dto.position??0}});
  }
  async deleteReference(userId:string,requirementId:string,referenceId:string) { await this.requirement(userId,requirementId,editRoles); const reference=await this.prisma.requirementReference.findFirst({where:{id:referenceId,requirementId}}); if(!reference) throw new NotFoundException('Referência não encontrada'); return this.prisma.requirementReference.delete({where:{id:referenceId}}); }

  private assertAnchor(anchor:Record<string,unknown>) { const {from,to,quote}=anchor; if(!Number.isInteger(from)||!Number.isInteger(to)||(from as number)<0||(to as number)<(from as number)||typeof quote!=='string'||quote.length>5000) throw new BadRequestException('Âncora de comentário inválida'); }
  private async assertMentionMembers(workspaceId:string, ids:string[], authorId:string) {
    const unique=[...new Set(ids)].filter(id=>id!==authorId); if(!unique.length) return unique;
    const count=await this.prisma.workspaceMember.count({where:{workspaceId,userId:{in:unique}}});
    if(count!==unique.length) throw new BadRequestException('Uma ou mais menções não pertencem ao workspace');
    return unique;
  }
  private commentInclude = { author:{select:{id:true,name:true,email:true}}, resolvedBy:{select:{id:true,name:true}}, messages:{orderBy:{createdAt:'asc' as const},include:{author:{select:{id:true,name:true,email:true}}}} };
  async comments(userId:string,requirementId:string) { await this.requirement(userId,requirementId); return this.prisma.commentThread.findMany({where:{requirementId},orderBy:{createdAt:'asc'},include:this.commentInclude}); }
  async createComment(userId:string,requirementId:string,dto:CreateCommentDto) {
    const requirement=await this.requirement(userId,requirementId,commentRoles); if(dto.anchor) this.assertAnchor(dto.anchor);
    if (requirement.status === 'ARCHIVED' || requirement.archivedAt) throw new BadRequestException('US cancelada está em modo somente leitura');
    const project=await this.project(userId,requirement.projectId); const mentions=await this.assertMentionMembers(project.workspaceId,dto.mentionedUserIds??[],userId);
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
    const {thread,project}=await this.commentThreadAccess(userId,threadId,commentRoles); const mentions=await this.assertMentionMembers(project.workspaceId,dto.mentionedUserIds??[],userId);
    if (thread.requirement.status === 'ARCHIVED' || thread.requirement.archivedAt) throw new BadRequestException('US cancelada está em modo somente leitura');
    try { return await this.prisma.$transaction(async tx=>{ const message=await tx.commentMessage.create({data:{threadId,authorId:userId,body:dto.body,mentionedUserIds:mentions},include:{author:{select:{id:true,name:true,email:true}}}}); if(mentions.length) await tx.notification.createMany({data:mentions.map(mentionedUserId=>({userId:mentionedUserId,type:'MENTION',commentMessageId:message.id}))}); return message; }); } catch (error) { this.logger.error(`comment reply failed thread=${threadId} user=${userId}`, error instanceof Error ? error.stack : undefined); throw error; }
  }
  async setCommentResolution(userId:string,threadId:string,resolved:boolean) {
    const {thread,project}=await this.commentThreadAccess(userId,threadId); const membership=await this.member(userId,project.workspaceId);
    if (thread.requirement.status === 'ARCHIVED' || thread.requirement.archivedAt) throw new BadRequestException('US cancelada está em modo somente leitura');
    if(thread.authorId!==userId && !editRoles.includes(membership.role)) throw new ForbiddenException('Apenas o autor, editor ou owner pode resolver comentários');
    return this.prisma.commentThread.update({where:{id:threadId},data:resolved?{status:'RESOLVED',resolvedAt:new Date(),resolvedById:userId}:{status:'OPEN',resolvedAt:null,resolvedById:null},include:this.commentInclude});
  }
  async notifications(userId:string) { return this.prisma.notification.findMany({where:{userId},orderBy:{createdAt:'desc'},include:{commentMessage:{include:{thread:{include:{requirement:{select:{id:true,title:true,projectId:true}}}},author:{select:{id:true,name:true}}}}}}); }
  async readNotification(userId:string,id:string) { const notification=await this.prisma.notification.findFirst({where:{id,userId}}); if(!notification) throw new NotFoundException('Notificação não encontrada'); return this.prisma.notification.update({where:{id},data:{readAt:new Date()}}); }
}
