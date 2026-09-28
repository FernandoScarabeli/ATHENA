import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Patch, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express'; import { JwtCookieGuard, userFrom } from '../common/auth';
import { OpenProjectConnectDto, OpenProjectFormDto, IntegrationMappingDto } from '../integrations/openproject.dto';
import { AttachGithubProjectDto, CreateExternalTaskDto, ExternalTaskSearchQueryDto, LinkExternalTaskDto } from '../integrations/external-task.dto';
import { OpenProjectService } from '../integrations/openproject.service'; import { AddWorkspaceMemberDto, ApproveIntegrationCandidateDto, ConfirmDeleteDto, CreateCommentDto, CreateCommentReplyDto, CreateFolderDto, CreateProjectDto, CreateRelationDto, CreateRequirementDto, CreateTemplateDto, CreateWorkspaceDto, MoveProjectDto, RejectIntegrationCandidateDto, UpdateFolderDto, UpdateProjectDto, UpdateRelationDto, UpdateRequirementDto, UpdateReviewChecklistDto, UpdateTemplateDto, UpdateWorkspaceDto, UpdateWorkspaceMemberDto } from './dto'; import { RequirementsService } from './requirements.service'; import { IntegrationsService } from '../integrations/integrations.service'; import { ConnectIntegrationDto } from '../integrations/integrations.dto'; import { GithubService } from '../integrations/github.service'; import { GithubImportDto, GithubRepositoriesQueryDto } from '../integrations/github.dto'; import { GoogleService } from '../integrations/google.service'; import { GoogleFilesQueryDto, GoogleImportDto, GoogleFolderLinkDto, GoogleSyncRunQueryDto } from '../integrations/google.dto';
import { GithubConnectDto } from '../integrations/github.dto';
import { IntegrationMappingsService } from '../integrations/integration-mappings.service'; import { ExternalTasksService } from '../integrations/external-tasks.service';
import { IntegrationActivityService } from '../integrations/integration-activity.service';
import { IntegrationActivityQueryDto } from '../integrations/google.dto';
@UseGuards(JwtCookieGuard) @Controller('projects') export class RequirementsController { constructor(private service:RequirementsService){} @Get(':projectId/requirements') list(@Req()r:Request,@Param('projectId')p:string,@Query('status')status?:string){return this.service.list(userFrom(r).sub,p,(status ?? 'active') as 'active'|'archived')} @Post(':projectId/requirements') create(@Req()r:Request,@Param('projectId')p:string,@Body()d:CreateRequirementDto){return this.service.create(userFrom(r).sub,p,d)} @Get(':projectId/graph') graph(@Req()r:Request,@Param('projectId')p:string){return this.service.graph(userFrom(r).sub,p)} @Get(':projectId/folders') folders(@Req()r:Request,@Param('projectId')p:string){return this.service.folders(userFrom(r).sub,p)} @Post(':projectId/folders') createFolder(@Req()r:Request,@Param('projectId')p:string,@Body()d:CreateFolderDto){return this.service.createFolder(userFrom(r).sub,p,d)} }
@UseGuards(JwtCookieGuard) @Controller() export class WorkspaceController {
  constructor(private service:RequirementsService, private integrations:IntegrationsService, private github:GithubService, private google:GoogleService, private openProject: OpenProjectService, private mappings: IntegrationMappingsService, private externalTasks: ExternalTasksService, private integrationActivity: IntegrationActivityService){}
  @Get('requirements/:id') get(@Req()r:Request,@Param('id')id:string){return this.service.requirement(userFrom(r).sub,id)}
  @Patch('requirements/:id') update(@Req()r:Request,@Param('id')id:string,@Body()d:UpdateRequirementDto){return this.service.update(userFrom(r).sub,id,d)}
  @Delete('requirements/:id') archive(@Req()r:Request,@Param('id')id:string){return this.service.archive(userFrom(r).sub,id)}
  @Get('requirements/:id/versions') versions(@Req()r:Request,@Param('id')id:string){return this.service.versions(userFrom(r).sub,id)}
  @Get('requirements/:id/diff') diff(@Req()r:Request,@Param('id')id:string,@Query('from',ParseIntPipe)f:number,@Query('to',ParseIntPipe)t:number){return this.service.diff(userFrom(r).sub,id,f,t)}
  @Get('requirements/:id/relations') relations(@Req()r:Request,@Param('id')id:string){return this.service.relations(userFrom(r).sub,id)}
  @Post('requirements/:id/relations') relation(@Req()r:Request,@Param('id')id:string,@Body()d:CreateRelationDto){return this.service.relate(userFrom(r).sub,id,d)}
  @Patch('requirements/:id/relations/:relationId') updateRelation(@Req()r:Request,@Param('id')id:string,@Param('relationId')relationId:string,@Body()d:UpdateRelationDto){return this.service.updateRelation(userFrom(r).sub,id,relationId,d)}
  @Delete('requirements/:id/relations/:relationId') remove(@Req()r:Request,@Param('id')id:string,@Param('relationId')relationId:string){return this.service.removeRelation(userFrom(r).sub,id,relationId)}
  @Get('requirements/:id/references') references(@Req()r:Request,@Param('id')id:string){return this.service.references(userFrom(r).sub,id)}
  @Post('requirements/:id/references') reference(@Req()r:Request,@Param('id')id:string){return this.service.createReference(userFrom(r).sub,id)}
  @Delete('requirements/:id/references/:referenceId') deleteReference(@Req()r:Request,@Param('id')id:string,@Param('referenceId')referenceId:string){return this.service.deleteReference(userFrom(r).sub,id,referenceId)}
  @Get('requirements/:id/comments') comments(@Req()r:Request,@Param('id')id:string){return this.service.comments(userFrom(r).sub,id)}
  @Post('requirements/:id/comments') comment(@Req()r:Request,@Param('id')id:string,@Body()d:CreateCommentDto){return this.service.createComment(userFrom(r).sub,id,d)}
  @Post('comments/:threadId/replies') reply(@Req()r:Request,@Param('threadId')threadId:string,@Body()d:CreateCommentReplyDto){return this.service.replyComment(userFrom(r).sub,threadId,d)}
  @Patch('comments/:threadId/resolve') resolve(@Req()r:Request,@Param('threadId')threadId:string){return this.service.setCommentResolution(userFrom(r).sub,threadId,true)}
  @Patch('comments/:threadId/reopen') reopen(@Req()r:Request,@Param('threadId')threadId:string){return this.service.setCommentResolution(userFrom(r).sub,threadId,false)}
  @Get('notifications') notifications(@Req()r:Request){return this.service.notifications(userFrom(r).sub)}
  @Patch('notifications/:id/read') readNotification(@Req()r:Request,@Param('id')id:string){return this.service.readNotification(userFrom(r).sub,id)}

  @Get('workspaces') workspaces(@Req()r:Request,@Query('includeArchived')includeArchived?:string){return this.service.workspaces(userFrom(r).sub,includeArchived==='true')}
  @Post('workspaces') workspace(@Req()r:Request,@Body()d:CreateWorkspaceDto){return this.service.workspace(userFrom(r).sub,d.name)}
  @Patch('workspaces/:workspaceId') updateWorkspace(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:UpdateWorkspaceDto){return this.service.updateWorkspace(userFrom(r).sub,w,d)}
  @Delete('workspaces/:workspaceId') archiveWorkspace(@Req()r:Request,@Param('workspaceId')w:string){return this.service.archiveWorkspace(userFrom(r).sub,w)}
  @Post('workspaces/:workspaceId/restore') restoreWorkspace(@Req()r:Request,@Param('workspaceId')w:string){return this.service.restoreWorkspace(userFrom(r).sub,w)}
  @Delete('workspaces/:workspaceId/permanent') permanentlyDeleteWorkspace(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:ConfirmDeleteDto){return this.service.permanentlyDeleteWorkspace(userFrom(r).sub,w,d)}
  @Post('workspaces/:workspaceId/projects') project(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:CreateProjectDto){return this.service.createProject(userFrom(r).sub,w,d.name,d.key)}
  @Patch('projects/:projectId') updateProject(@Req()r:Request,@Param('projectId')p:string,@Body()d:UpdateProjectDto){return this.service.updateProject(userFrom(r).sub,p,d)}
  @Delete('projects/:projectId') archiveProject(@Req()r:Request,@Param('projectId')p:string){return this.service.archiveProject(userFrom(r).sub,p)}
  @Post('projects/:projectId/restore') restoreProject(@Req()r:Request,@Param('projectId')p:string){return this.service.restoreProject(userFrom(r).sub,p)}
  @Delete('projects/:projectId/permanent') permanentlyDeleteProject(@Req()r:Request,@Param('projectId')p:string,@Body()d:ConfirmDeleteDto){return this.service.permanentlyDeleteProject(userFrom(r).sub,p,d)}
  @Post('projects/:projectId/move') moveProject(@Req()r:Request,@Param('projectId')p:string,@Body()d:MoveProjectDto){return this.service.moveProject(userFrom(r).sub,p,d)}
  @Get('workspaces/:workspaceId/members') members(@Req()r:Request,@Param('workspaceId')w:string){return this.service.members(userFrom(r).sub,w)}
  @Get('workspaces/:workspaceId/participants') participants(@Req()r:Request,@Param('workspaceId')w:string){return this.service.participants(userFrom(r).sub,w)}
  @Patch('workspaces/:workspaceId/members/:memberUserId') updateMember(@Req()r:Request,@Param('workspaceId')w:string,@Param('memberUserId')memberUserId:string,@Body()d:UpdateWorkspaceMemberDto){return this.service.updateMember(userFrom(r).sub,w,memberUserId,d)}
  @Delete('workspaces/:workspaceId/members/:memberUserId') removeMember(@Req()r:Request,@Param('workspaceId')w:string,@Param('memberUserId')memberUserId:string){return this.service.removeMember(userFrom(r).sub,w,memberUserId)}
  @Get('workspaces/:workspaceId/review-checklist') reviewChecklist(@Req()r:Request,@Param('workspaceId')w:string){return this.service.reviewChecklist(userFrom(r).sub,w)}
  @Put('workspaces/:workspaceId/review-checklist') updateReviewChecklist(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:UpdateReviewChecklistDto){return this.service.updateReviewChecklist(userFrom(r).sub,w,d)}
  @Get('workspaces/:workspaceId/templates') templates(@Req()r:Request,@Param('workspaceId')w:string){return this.service.templates(userFrom(r).sub,w)}
  @Patch('projects/:projectId/folders/:id') updateFolder(@Req()r:Request,@Param('projectId')p:string,@Param('id')id:string,@Body()d:UpdateFolderDto){return this.service.updateFolder(userFrom(r).sub,p,id,d)}
  @Delete('projects/:projectId/folders/:id') deleteFolder(@Req()r:Request,@Param('projectId')p:string,@Param('id')id:string){return this.service.deleteFolder(userFrom(r).sub,p,id)}
  @Post('workspaces/:workspaceId/templates') createTemplate(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:CreateTemplateDto){return this.service.createTemplate(userFrom(r).sub,w,d)}
  @Get('workspaces/:workspaceId/integrations') integrationsList(@Req()r:Request,@Param('workspaceId')w:string){return this.integrations.list(userFrom(r).sub,w)}
  @Post('workspaces/:workspaceId/integrations') integrationsConnect(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:ConnectIntegrationDto){if(d.kind==='OPENPROJECT') throw new BadRequestException('Use o endpoint de validação do OpenProject');return this.integrations.connect(userFrom(r).sub,w,d.kind,d.credentials,d.accountLabel)}
  @Post('workspaces/:workspaceId/integrations/github/connect') githubConnect(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:GithubConnectDto){return this.github.connect(userFrom(r).sub,w,d.token)}
  @Delete('workspaces/:workspaceId/integrations/:kind') integrationsDisconnect(@Req()r:Request,@Param('workspaceId')w:string,@Param('kind')kind:any){return this.integrations.disconnect(userFrom(r).sub,w,kind)}
  @Post('workspaces/:workspaceId/integrations/openproject/connect') openProjectConnect(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:OpenProjectConnectDto){return this.openProject.connect(userFrom(r).sub,w,d.instanceUrl,d.apiToken)}
  @Get('workspaces/:workspaceId/integrations/openproject/projects') openProjectProjects(@Req()r:Request,@Param('workspaceId')w:string){return this.openProject.projects(userFrom(r).sub,w)}
  @Get('workspaces/:workspaceId/integrations/activity') integrationActivityList(@Req()r:Request,@Param('workspaceId')w:string,@Query()q:IntegrationActivityQueryDto){return this.integrationActivity.list(userFrom(r).sub,w,q.cursor,q.limit,q.provider,q.from,q.to,q.status)}
  @Get('workspaces/:workspaceId/integrations/openproject/types') openProjectTypes(@Req()r:Request,@Param('workspaceId')w:string,@Query('projectId',ParseIntPipe)p:number){return this.openProject.types(userFrom(r).sub,w,p)}
  @Get('workspaces/:workspaceId/integrations/github/projects') githubProjects(@Req()r:Request,@Param('workspaceId')w:string,@Query('owner')owner:string){return this.github.projects(userFrom(r).sub,w,owner)}
  @Get('projects/:projectId/integration-mappings') integrationMappings(@Req()r:Request,@Param('projectId')p:string){return this.mappings.list(userFrom(r).sub,p)}
  @Post('projects/:projectId/integration-mappings') saveIntegrationMapping(@Req()r:Request,@Param('projectId')p:string,@Body()d:IntegrationMappingDto){return this.mappings.save(userFrom(r).sub,p,d)}
  @Delete('projects/:projectId/integration-mappings/:mappingId') removeIntegrationMapping(@Req()r:Request,@Param('projectId')p:string,@Param('mappingId')id:string){return this.mappings.remove(userFrom(r).sub,p,id)}
  @Get('projects/:projectId/integration-targets') integrationTargets(@Req()r:Request,@Param('projectId')p:string){return this.mappings.targets(userFrom(r).sub,p)}
  @Get('projects/:projectId/integrations/openproject/types') projectOpenProjectTypes(@Req()r:Request,@Param('projectId')p:string,@Query('projectId',ParseIntPipe)externalId:number){return this.openProject.typesForProject(userFrom(r).sub,p,externalId)}
  @Post('projects/:projectId/integrations/openproject/form') projectOpenProjectForm(@Req()r:Request,@Param('projectId')p:string,@Body()d:OpenProjectFormDto){return this.openProject.form(userFrom(r).sub,p,d.projectId,d.typeId,d.payload)}
  @Get('projects/:projectId/integrations/openproject/work-packages') searchOpenProject(@Req()r:Request,@Param('projectId')p:string,@Query()q:ExternalTaskSearchQueryDto){return this.openProject.searchMapped(userFrom(r).sub,p,q.mappingId,q.q)}
  @Get('projects/:projectId/integrations/github/issues') searchGithubIssues(@Req()r:Request,@Param('projectId')p:string,@Query()q:ExternalTaskSearchQueryDto){return this.externalTasks.searchGithub(userFrom(r).sub,p,q.mappingId,q.q)}
  @Get('requirements/:id/external-links') externalLinks(@Req()r:Request,@Param('id')id:string){return this.externalTasks.list(userFrom(r).sub,id)}
  @Post('requirements/:id/external-links') createExternalTask(@Req()r:Request,@Param('id')id:string,@Body()d:CreateExternalTaskDto){return this.externalTasks.create(userFrom(r).sub,id,d,r.header('Idempotency-Key'))}
  @Post('requirements/:id/external-links/link') linkExternalTask(@Req()r:Request,@Param('id')id:string,@Body()d:LinkExternalTaskDto){return this.externalTasks.link(userFrom(r).sub,id,d)}
  @Post('requirements/:id/external-links/:linkId/github-project') attachGithubProject(@Req()r:Request,@Param('id')id:string,@Param('linkId')linkId:string,@Body()d:AttachGithubProjectDto){return this.externalTasks.attachGithubProject(userFrom(r).sub,id,linkId,d)}
  @Get('workspaces/:workspaceId/integrations/github/account') githubAccount(@Req()r:Request,@Param('workspaceId')w:string){return this.github.account(userFrom(r).sub,w)}
  @Get('workspaces/:workspaceId/integrations/github/repositories') githubRepositories(@Req()r:Request,@Param('workspaceId')w:string,@Query()q:GithubRepositoriesQueryDto){return this.github.repositories(userFrom(r).sub,w,q.page)}
  @Post('workspaces/:workspaceId/integrations/github/import') githubImport(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:GithubImportDto){return this.github.importSources(userFrom(r).sub,w,d.sources)}
  @Get('workspaces/:workspaceId/integrations/google/oauth/start') googleOAuthStart(@Req()r:Request,@Param('workspaceId')w:string){return this.google.start(userFrom(r).sub,w)}
  @Get('workspaces/:workspaceId/integrations/google/files') googleFiles(@Req()r:Request,@Param('workspaceId')w:string,@Query()q:GoogleFilesQueryDto){return this.google.files(userFrom(r).sub,w,q.pageToken)}
  @Get('workspaces/:workspaceId/integrations/google/folders') googleFolders(@Req()r:Request,@Param('workspaceId')w:string,@Query()q:GoogleFilesQueryDto){return this.google.folders(userFrom(r).sub,w,q.pageToken,q.query)}
  @Get('workspaces/:workspaceId/integrations/google/folder-links') googleFolderLinks(@Req()r:Request,@Param('workspaceId')w:string){return this.google.folderLinks(userFrom(r).sub,w)}
  @Get('workspaces/:workspaceId/integrations/google/sync-runs') googleSyncRuns(@Req()r:Request,@Param('workspaceId')w:string,@Query()q:GoogleSyncRunQueryDto){return this.google.syncRuns(userFrom(r).sub,w,q.cursor,q.limit)}
  @Get('workspaces/:workspaceId/integrations/google/sync-runs/:runId/items') googleSyncRunItems(@Req()r:Request,@Param('workspaceId')w:string,@Param('runId')id:string,@Query()q:GoogleSyncRunQueryDto){return this.google.syncRunItems(userFrom(r).sub,w,id,q.cursor,q.limit)}
  @Post('workspaces/:workspaceId/integrations/google/folder-links') googleLinkFolder(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:GoogleFolderLinkDto){return this.google.linkFolder(userFrom(r).sub,w,d.externalId,d.name,d.projectId)}
  @Post('workspaces/:workspaceId/integrations/google/folder-links/:linkId/export-root') googleExportRoot(@Req()r:Request,@Param('workspaceId')w:string,@Param('linkId')id:string){return this.google.setExportRoot(userFrom(r).sub,w,id)}
  @Post('workspaces/:workspaceId/integrations/google/folder-links/:linkId/sync') googleSyncFolder(@Req()r:Request,@Param('workspaceId')w:string,@Param('linkId')id:string){return this.google.syncFolder(userFrom(r).sub,w,id)}
  @Get('projects/:projectId/integrations/google/export-preview') googleExportPreview(@Req()r:Request,@Param('projectId')p:string){return this.google.exportPreview(userFrom(r).sub,p)}
  @Post('projects/:projectId/integrations/google/export') googleExportExisting(@Req()r:Request,@Param('projectId')p:string){return this.google.exportExisting(userFrom(r).sub,p)}
  @Get('projects/:projectId/integrations/google/export-status') googleExportStatus(@Req()r:Request,@Param('projectId')p:string){return this.google.exportStatus(userFrom(r).sub,p)}
  @Post('workspaces/:workspaceId/integrations/google/import') googleImport(@Req()r:Request,@Param('workspaceId')w:string,@Body()d:GoogleImportDto){return this.google.importFiles(userFrom(r).sub,w,d.files)}
  @Get('workspaces/:workspaceId/integration-candidates') integrationCandidates(@Req()r:Request,@Param('workspaceId')w:string,@Query('status')status?:any){return this.integrations.candidates(userFrom(r).sub,w,status)}
  @Get('integration-candidates/:id') integrationCandidate(@Req()r:Request,@Param('id')id:string){return this.integrations.candidate(userFrom(r).sub,id)}
  @Post('integration-candidates/:id/approve') approveIntegrationCandidate(@Req()r:Request,@Param('id')id:string,@Body()d:ApproveIntegrationCandidateDto){return this.integrations.approveCandidate(userFrom(r).sub,id,d)}
  @Post('integration-candidates/:id/reject') rejectIntegrationCandidate(@Req()r:Request,@Param('id')id:string,@Body()d:RejectIntegrationCandidateDto){return this.integrations.rejectCandidate(userFrom(r).sub,id,d.expectedUpdatedAt)}
  @Get('templates/:id') template(@Req()r:Request,@Param('id')id:string){return this.service.template(userFrom(r).sub,id)}
  @Patch('templates/:id') updateTemplate(@Req()r:Request,@Param('id')id:string,@Body()d:UpdateTemplateDto){return this.service.updateTemplate(userFrom(r).sub,id,d)}
  @Delete('templates/:id') deleteTemplate(@Req()r:Request,@Param('id')id:string){return this.service.deleteTemplate(userFrom(r).sub,id)}
}
