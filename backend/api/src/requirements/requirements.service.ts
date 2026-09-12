import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, RelationType, RequirementType, WorkspaceRole } from '@prisma/client';
import { AddWorkspaceMemberDto, CreateCommentDto, CreateCommentReplyDto, CreateFolderDto, CreateProjectDto, CreateReferenceDto, CreateRelationDto, CreateRequirementDto, CreateTemplateDto, CreateWorkspaceDto, UpdateFolderDto, UpdateRequirementDto, UpdateTemplateDto, UpdateWorkspaceMemberDto } from './dto';
import { PrismaService } from '../core/prisma.service';

const include = { criteria:{orderBy:{position:'asc' as const}}, references:{orderBy:{position:'asc' as const}}, folder:true };
const readRoles: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER];
const editRoles: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.EDITOR];
const commentRoles = readRoles;
type CriterionInput = { text: string; title?: string; given?: string; when?: string; then?: string; content?: Record<string, unknown> };

@Injectable()
export class RequirementsService {
  private readonly logger = new Logger(RequirementsService.name);
  constructor(private prisma:PrismaService) {}

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
  private validUrl(url:string) { return /^(https?:\/\/|mailto:)/i.test(url); }

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
    const criteria = dto.acceptanceCriteria?.length ? dto.acceptanceCriteria : templateCriteria;
    const folder = await this.prisma.requirementFolder.findFirst({where:{id:dto.folderId,workspaceId:project.workspaceId}});
    if (!folder) throw new NotFoundException('Pasta não encontrada neste workspace');
    return this.prisma.$transaction(async tx=>{
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
  }
  async list(userId:string,projectId:string) { await this.project(userId,projectId); return this.prisma.requirement.findMany({where:{projectId,archivedAt:null},include,orderBy:{updatedAt:'desc'}}); }
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
    return this.prisma.$transaction(async tx=>{
      const changed=await tx.requirement.updateMany({where:{id,revision:current.revision,archivedAt:null},data:{
        ...data,content:data.content as Prisma.InputJsonValue,status:current.status==='DRAFT'?'ACTIVE':undefined,revision:{increment:1},
      }});
      if (changed.count!==1) throw new ConflictException({code:'REQUIREMENT_REVISION_CONFLICT',message:'O requisito foi alterado por outra pessoa'});
      if (acceptanceCriteria) {
        await tx.acceptanceCriterion.deleteMany({where:{requirementId:id}});
        if (acceptanceCriteria.length) await tx.acceptanceCriterion.createMany({data:this.criteriaCreate(acceptanceCriteria).map(criterion=>({...criterion,requirementId:id}))});
      }
      await tx.requirementVersion.create({data:{requirementId:id,revision:current.revision,snapshot:current as unknown as Prisma.InputJsonValue}});
      const updated=await tx.requirement.findUniqueOrThrow({where:{id},include});
      await tx.activityLog.create({data:{userId,projectId:current.projectId,action:'REQUIREMENT_UPDATED',entityId:id}});
      return updated;
    });
  }
  async archive(userId:string,id:string) { const requirement=await this.requirement(userId,id,editRoles); return this.prisma.$transaction(async tx=>{ await tx.requirementRelation.deleteMany({where:{OR:[{sourceId:id},{targetId:id}]}}); return tx.requirement.update({where:{id:requirement.id},data:{status:'ARCHIVED',archivedAt:new Date()}}); }); }
  async versions(userId:string,id:string) { await this.requirement(userId,id); return this.prisma.requirementVersion.findMany({where:{requirementId:id},orderBy:{revision:'desc'}}); }
  async diff(userId:string,id:string,from:number,to:number) {
    await this.requirement(userId,id);
    const versions=await this.prisma.requirementVersion.findMany({where:{requirementId:id,revision:{in:[from,to]}}});
    if(versions.length!==2) throw new NotFoundException('Versões não encontradas');
    const a=versions.find(version=>version.revision===from)!.snapshot as any, b=versions.find(version=>version.revision===to)!.snapshot as any;
    const changedFields=Object.keys({...a,...b}).filter(key=>JSON.stringify(a[key])!==JSON.stringify(b[key])&&key!=='criteria');
    const criteria = (value:any) => new Set((value.criteria??value.acceptanceCriteria??[]).map((criterion:any)=>criterion.text));
    const aa=criteria(a),bb=criteria(b);
    return {from,to,changedFields,criteriaAdded:[...bb].filter(value=>!aa.has(value)),criteriaRemoved:[...aa].filter(value=>!bb.has(value))};
  }
  async relate(userId:string,id:string,dto:CreateRelationDto) {
    const source=await this.requirement(userId,id,editRoles),target=await this.requirement(userId,dto.targetId,editRoles);
    if (source.status==='ARCHIVED' || target.status==='ARCHIVED') throw new BadRequestException('US cancelada não pode possuir relações');
    if(source.projectId!==target.projectId) throw new BadRequestException('Relações precisam pertencer ao mesmo projeto');
    if(id===dto.targetId) throw new BadRequestException('Autorrelação não permitida');
    const reverse=await this.prisma.requirementRelation.findFirst({where:{sourceId:dto.targetId,targetId:id,type:dto.type as RelationType}});
    if(reverse&&dto.type==='RELATED_TO') throw new ConflictException('Relação equivalente já existe');
    return this.prisma.requirementRelation.create({data:{sourceId:id,targetId:dto.targetId,type:dto.type as RelationType}});
  }
  async relations(userId:string,id:string) { await this.requirement(userId,id); return this.prisma.requirementRelation.findMany({where:{OR:[{sourceId:id},{targetId:id}]},include:{source:true,target:true}}); }
  async removeRelation(userId:string, requirementId:string, relationId:string) {
    await this.requirement(userId,requirementId,editRoles);
    const relation=await this.prisma.requirementRelation.findFirst({where:{id:relationId,OR:[{sourceId:requirementId},{targetId:requirementId}]}});
    if(!relation) throw new NotFoundException('Relação não encontrada');
    return this.prisma.requirementRelation.delete({where:{id:relationId}});
  }
  async graph(userId:string,projectId:string) { await this.project(userId,projectId); const requirements=await this.prisma.requirement.findMany({where:{projectId,archivedAt:null},select:{id:true,code:true,title:true,type:true,status:true}}); const ids=requirements.map(requirement=>requirement.id); const edges=await this.prisma.requirementRelation.findMany({where:{sourceId:{in:ids},targetId:{in:ids}}}); return {nodes:requirements,edges:edges.map(edge=>({id:edge.id,source:edge.sourceId,target:edge.targetId,type:edge.type}))}; }
  async folders(userId:string,workspaceId:string) { await this.member(userId,workspaceId); return this.prisma.requirementFolder.findMany({where:{workspaceId},orderBy:{name:'asc'},include:{_count:{select:{requirements:{where:{archivedAt:null}}}}}}).then(folders=>folders.map(folder=>({...folder,requirementCount:folder._count.requirements,_count:undefined}))); }
  async createFolder(userId:string,workspaceId:string,dto:CreateFolderDto) { await this.member(userId,workspaceId,editRoles); return this.prisma.requirementFolder.create({data:{workspaceId,name:dto.name.trim(),description:dto.description?.trim()||null}}); }
  async updateFolder(userId:string,id:string,dto:UpdateFolderDto) { const folder=await this.prisma.requirementFolder.findUnique({where:{id}}); if(!folder) throw new NotFoundException('Pasta não encontrada'); await this.member(userId,folder.workspaceId,editRoles); return this.prisma.requirementFolder.update({where:{id},data:{...(dto.name!==undefined?{name:dto.name.trim()}:{}),...(dto.description!==undefined?{description:dto.description.trim()||null}:{})}}); }
  async deleteFolder(userId:string,id:string) { const folder=await this.prisma.requirementFolder.findUnique({where:{id}}); if(!folder) throw new NotFoundException('Pasta não encontrada'); await this.member(userId,folder.workspaceId,editRoles); if(folder.name==='Sem pasta') throw new BadRequestException('A pasta Sem pasta não pode ser excluída'); const fallback=await this.prisma.requirementFolder.findFirst({where:{workspaceId:folder.workspaceId,name:'Sem pasta'}}); if(!fallback) throw new NotFoundException('Pasta Sem pasta não encontrada'); await this.prisma.$transaction([this.prisma.requirement.updateMany({where:{folderId:id},data:{folderId:fallback.id}}),this.prisma.requirementFolder.delete({where:{id}})]); return {ok:true}; }
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
    await this.member(userId,workspaceId,[WorkspaceRole.OWNER]);
    const user=await this.prisma.user.findUnique({where:{email:dto.email.trim().toLowerCase()},select:{id:true,name:true,email:true}});
    if(!user) throw new NotFoundException('Não existe uma conta cadastrada com este e-mail');
    const membership=await this.prisma.workspaceMember.upsert({where:{workspaceId_userId:{workspaceId,userId:user.id}},create:{workspaceId,userId:user.id,role:dto.role},update:{role:dto.role},select:{role:true}});
    return {...membership,user};
  }
  async updateMember(userId:string,workspaceId:string,memberUserId:string,dto:UpdateWorkspaceMemberDto) {
    await this.member(userId,workspaceId,[WorkspaceRole.OWNER]);
    const target=await this.prisma.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId,userId:memberUserId}}});
    if(!target) throw new NotFoundException('Membro não encontrado');
    if(target.role===WorkspaceRole.OWNER && dto.role!==WorkspaceRole.OWNER) {
      const ownerCount=await this.prisma.workspaceMember.count({where:{workspaceId,role:WorkspaceRole.OWNER}});
      if(ownerCount<=1) throw new BadRequestException('O workspace precisa manter ao menos um owner');
    }
    return this.prisma.workspaceMember.update({where:{workspaceId_userId:{workspaceId,userId:memberUserId}},data:{role:dto.role}});
  }
  async removeMember(userId:string,workspaceId:string,memberUserId:string) {
    await this.member(userId,workspaceId,[WorkspaceRole.OWNER]);
    const target=await this.prisma.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId,userId:memberUserId}}});
    if(!target) throw new NotFoundException('Membro não encontrado');
    if(target.role===WorkspaceRole.OWNER) {
      const ownerCount=await this.prisma.workspaceMember.count({where:{workspaceId,role:WorkspaceRole.OWNER}});
      if(ownerCount<=1) throw new BadRequestException('O workspace precisa manter ao menos um owner');
    }
    return this.prisma.workspaceMember.delete({where:{workspaceId_userId:{workspaceId,userId:memberUserId}}});
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
  async createReference(userId:string,requirementId:string,dto:CreateReferenceDto) { await this.requirement(userId,requirementId,editRoles); if(!this.validUrl(dto.url)) throw new BadRequestException('A referência deve usar http, https ou mailto'); return this.prisma.requirementReference.create({data:{requirementId,type:dto.type,name:dto.name,url:dto.url,position:dto.position??0}}); }
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
    const project=await this.project(userId,requirement.projectId); const mentions=await this.assertMentionMembers(project.workspaceId,dto.mentionedUserIds??[],userId);
    try { return await this.prisma.$transaction(async tx=>{
        const thread=await tx.commentThread.create({data:{requirementId,authorId:userId,...(dto.anchor ? {anchor:dto.anchor as Prisma.InputJsonValue} : {}),messages:{create:{authorId:userId,body:dto.body,mentionedUserIds:mentions}}},include:{messages:true}});
        if(mentions.length) await tx.notification.createMany({data:mentions.map(mentionedUserId=>({userId:mentionedUserId,type:'MENTION',commentMessageId:thread.messages[0].id}))});
        return tx.commentThread.findUniqueOrThrow({where:{id:thread.id},include:this.commentInclude});
      }); } catch (error) { this.logger.error(`comment creation failed requirement=${requirementId} user=${userId}`, error instanceof Error ? error.stack : undefined); throw error; }
  }
  private async commentThreadAccess(userId:string,threadId:string,allowed:WorkspaceRole[]=readRoles) {
    const thread=await this.prisma.commentThread.findUnique({where:{id:threadId},include:{requirement:{select:{projectId:true}}}}); if(!thread) throw new NotFoundException('Comentário não encontrado');
    const project=await this.project(userId,thread.requirement.projectId,allowed); return {thread,project};
  }
  async replyComment(userId:string,threadId:string,dto:CreateCommentReplyDto) {
    const {thread,project}=await this.commentThreadAccess(userId,threadId,commentRoles); const mentions=await this.assertMentionMembers(project.workspaceId,dto.mentionedUserIds??[],userId);
    try { return await this.prisma.$transaction(async tx=>{ const message=await tx.commentMessage.create({data:{threadId,authorId:userId,body:dto.body,mentionedUserIds:mentions},include:{author:{select:{id:true,name:true,email:true}}}}); if(mentions.length) await tx.notification.createMany({data:mentions.map(mentionedUserId=>({userId:mentionedUserId,type:'MENTION',commentMessageId:message.id}))}); return message; }); } catch (error) { this.logger.error(`comment reply failed thread=${threadId} user=${userId}`, error instanceof Error ? error.stack : undefined); throw error; }
  }
  async setCommentResolution(userId:string,threadId:string,resolved:boolean) {
    const {thread,project}=await this.commentThreadAccess(userId,threadId); const membership=await this.member(userId,project.workspaceId);
    if(thread.authorId!==userId && !editRoles.includes(membership.role)) throw new ForbiddenException('Apenas o autor, editor ou owner pode resolver comentários');
    return this.prisma.commentThread.update({where:{id:threadId},data:resolved?{status:'RESOLVED',resolvedAt:new Date(),resolvedById:userId}:{status:'OPEN',resolvedAt:null,resolvedById:null},include:this.commentInclude});
  }
  async notifications(userId:string) { return this.prisma.notification.findMany({where:{userId},orderBy:{createdAt:'desc'},include:{commentMessage:{include:{thread:{include:{requirement:{select:{id:true,title:true,projectId:true}}}},author:{select:{id:true,name:true}}}}}}); }
  async readNotification(userId:string,id:string) { const notification=await this.prisma.notification.findFirst({where:{id,userId}}); if(!notification) throw new NotFoundException('Notificação não encontrada'); return this.prisma.notification.update({where:{id},data:{readAt:new Date()}}); }
}
