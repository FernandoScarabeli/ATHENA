import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express'; import { JwtCookieGuard, userFrom } from '../common/auth';
import { AddWorkspaceMemberDto, CreateCommentDto, CreateCommentReplyDto, CreateFolderDto, CreateProjectDto, CreateReferenceDto, CreateRelationDto, CreateRequirementDto, CreateTemplateDto, CreateWorkspaceDto, UpdateFolderDto, UpdateRequirementDto, UpdateTemplateDto, UpdateWorkspaceMemberDto } from './dto'; import { RequirementsService } from './requirements.service';
@UseGuards(JwtCookieGuard) @Controller('projects') export class RequirementsController { constructor(private service:RequirementsService){} @Get(':projectId/requirements') list(@Req()r:Request,@Param('projectId')p:string){return this.service.list(userFrom(r).sub,p)} @Post(':projectId/requirements') create(@Req()r:Request,@Param('projectId')p:string,@Body()d:CreateRequirementDto){return this.service.create(userFrom(r).sub,p,d)} @Get(':projectId/graph') graph(@Req()r:Request,@Param('projectId')p:string){return this.service.graph(userFrom(r).sub,p)} }
@UseGuards(JwtCookieGuard) @Controller() export class WorkspaceController {
  constructor(private service:RequirementsService){}
  @Get('requirements/:id') get(@Req()r:Request,@Param('id')id:string){return this.service.requirement(userFrom(r).sub,id)}
  @Patch('requirements/:id') update(@Req()r:Request,@Param('id')id:string,@Body()d:UpdateRequirementDto){return this.service.update(userFrom(r).sub,id,d)}
  @Delete('requirements/:id') archive(@Req()r:Request,@Param('id')id:string){return this.service.archive(userFrom(r).sub,id)}
  @Get('requirements/:id/versions') versions(@Req()r:Request,@Param('id')id:string){return this.service.versions(userFrom(r).sub,id)}
  @Get('requirements/:id/diff') diff(@Req()r:Request,@Param('id')id:string,@Query('from',ParseIntPipe)f:number,@Query('to',ParseIntPipe)t:number){return this.service.diff(userFrom(r).sub,id,f,t)}
  @Get('requirements/:id/relations') relations(@Req()r:Request,@Param('id')id:string){return this.service.relations(userFrom(r).sub,id)}
  @Post('requirements/:id/relations') relation(@Req()r:Request,@Param('id')id:string,@Body()d:CreateRelationDto){return this.service.relate(userFrom(r).sub,id,d)}
  @Delete('requirements/:id/relations/:relationId') remove(@Req()r:Request,@Param('id')id:string,@Param('relationId')relationId:string){return this.service.removeRelation(userFrom(r).sub,id,relationId)}
  @Get('requirements/:id/references') references(@Req()r:Request,@Param('id')id:string){return this.service.references(userFrom(r).sub,id)}
  @Post('requirements/:id/references') reference(@Req()r:Request,@Param('id')id:string,@Body()d:CreateReferenceDto){return this.service.createReference(userFrom(r).sub,id,d)}
  @Delete('requirements/:id/references/:referenceId') deleteReference(@Req()r:Request,@Param('id')id:string,@Param('referenceId')referenceId:string){return this.service.deleteReference(userFrom(r).sub,id,referenceId)}
  @Get('requirements/:id/comments') comments(@Req()r:Request,@Param('id')id:string){return this.service.comments(userFrom(r).sub,id)}
  @Post('requirements/:id/comments') comment(@Req()r:Request,@Param('id')id:string,@Body()d:CreateCommentDto){return this.service.createComment(userFrom(r).sub,id,d)}
  @Post('comments/:threadId/replies') reply(@Req()r:Request,@Param('threadId')threadId:string,@Body()d:CreateCommentReplyDto){return this.service.replyComment(userFrom(r).sub,threadId,d)}
  @Patch('comments/:threadId/resolve') resolve(@Req()r:Request,@Param('threadId')threadId:string){return this.service.setCommentResolution(userFrom(r).sub,threadId,true)}
  @Patch('comments/:threadId/reopen') reopen(@Req()r:Request,@Param('threadId')threadId:string){return this.service.setCommentResolution(userFrom(r).sub,threadId,false)}
  @Get('notifications') notifications(@Req()r:Request){return this.service.notifications(userFrom(r).sub)}
  @Patch('notifications/:id/read') readNotification(@Req()r:Request,@Param('id')id:string){return this.service.readNotification(userFrom(r).sub,id)}

  @Get('workspaces') workspaces(@Req()r:Request){return this.service.workspaces(userFrom(r).sub)}
  @Post('workspaces') workspace(@Req()r:Request,@Body()d:CreateWorkspaceDto){return this.service.workspace(userFrom(r).sub,d.name)}
  @Post('workspaces/:workspaceId/projects') project(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:CreateProjectDto){return this.service.createProject(userFrom(r).sub,w,d.name,d.key)}
  @Get('workspaces/:workspaceId/members') members(@Req()r:Request,@Param('workspaceId')w:string){return this.service.members(userFrom(r).sub,w)}
  @Get('workspaces/:workspaceId/participants') participants(@Req()r:Request,@Param('workspaceId')w:string){return this.service.participants(userFrom(r).sub,w)}
  @Post('workspaces/:workspaceId/members') addMember(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:AddWorkspaceMemberDto){return this.service.addMember(userFrom(r).sub,w,d)}
  @Patch('workspaces/:workspaceId/members/:memberUserId') updateMember(@Req()r:Request,@Param('workspaceId')w:string,@Param('memberUserId')memberUserId:string,@Body()d:UpdateWorkspaceMemberDto){return this.service.updateMember(userFrom(r).sub,w,memberUserId,d)}
  @Delete('workspaces/:workspaceId/members/:memberUserId') removeMember(@Req()r:Request,@Param('workspaceId')w:string,@Param('memberUserId')memberUserId:string){return this.service.removeMember(userFrom(r).sub,w,memberUserId)}
  @Get('workspaces/:workspaceId/templates') templates(@Req()r:Request,@Param('workspaceId')w:string){return this.service.templates(userFrom(r).sub,w)}
  @Get('workspaces/:workspaceId/folders') folders(@Req()r:Request,@Param('workspaceId')w:string){return this.service.folders(userFrom(r).sub,w)}
  @Post('workspaces/:workspaceId/folders') createFolder(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:CreateFolderDto){return this.service.createFolder(userFrom(r).sub,w,d)}
  @Patch('folders/:id') updateFolder(@Req()r:Request,@Param('id')id:string,@Body()d:UpdateFolderDto){return this.service.updateFolder(userFrom(r).sub,id,d)}
  @Delete('folders/:id') deleteFolder(@Req()r:Request,@Param('id')id:string){return this.service.deleteFolder(userFrom(r).sub,id)}
  @Post('workspaces/:workspaceId/templates') createTemplate(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:CreateTemplateDto){return this.service.createTemplate(userFrom(r).sub,w,d)}
  @Get('templates/:id') template(@Req()r:Request,@Param('id')id:string){return this.service.template(userFrom(r).sub,id)}
  @Patch('templates/:id') updateTemplate(@Req()r:Request,@Param('id')id:string,@Body()d:UpdateTemplateDto){return this.service.updateTemplate(userFrom(r).sub,id,d)}
  @Delete('templates/:id') deleteTemplate(@Req()r:Request,@Param('id')id:string){return this.service.deleteTemplate(userFrom(r).sub,id)}
}
