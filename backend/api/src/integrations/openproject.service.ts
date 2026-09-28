import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationKind, IntegrationStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { IntegrationMappingsService } from './integration-mappings.service';
import { IntegrationsService } from './integrations.service';
import { OpenProjectAdapter, OpenProjectApiError, OpenProjectCredentials } from './openproject.adapter';
import { requireProjectAccess, requireWorkspaceManagerOrOwner } from '../common/project-access';

const editorRoles = [WorkspaceRole.OWNER, WorkspaceRole.EDITOR];

@Injectable()
export class OpenProjectService {
  constructor(private readonly prisma: PrismaService, private readonly integrations: IntegrationsService, private readonly mappings: IntegrationMappingsService, private readonly openProject: OpenProjectAdapter) {}

  private async member(userId: string, workspaceId: string, roles: WorkspaceRole[] = editorRoles) {
    const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!member || !roles.includes(member.role)) throw new ForbiddenException('Você não tem permissão para esta ação');
    return member;
  }

  private credentials(value: Record<string, string>): OpenProjectCredentials { return { instanceUrl: value.instanceUrl, apiToken: value.apiToken }; }

  async connect(userId: string, workspaceId: string, instanceUrl: string, apiToken: string) {
    await this.member(userId, workspaceId, [WorkspaceRole.OWNER]);
    const credentials = { instanceUrl: new URL(instanceUrl).origin, apiToken };
    const account = await this.safe(() => this.openProject.validateConnection(credentials));
    return this.integrations.connect(userId, workspaceId, IntegrationKind.OPENPROJECT, credentials, account.account);
  }

  async projects(userId: string, workspaceId: string) {
    await requireWorkspaceManagerOrOwner(this.prisma, userId, workspaceId);
    const credentials = this.credentials(await this.integrations.activeCredentials(workspaceId, IntegrationKind.OPENPROJECT));
    return this.safe(() => this.openProject.projects(credentials));
  }

  async types(userId: string, workspaceId: string, projectId: number) {
    await requireWorkspaceManagerOrOwner(this.prisma, userId, workspaceId);
    const credentials = this.credentials(await this.integrations.activeCredentials(workspaceId, IntegrationKind.OPENPROJECT));
    return this.safe(() => this.openProject.types(credentials, projectId));
  }

  async typesForProject(userId: string, athenaProjectId: string, externalProjectId: number) {
    const athena = await this.prisma.project.findUnique({ where: { id: athenaProjectId }, select: { workspaceId: true } });
    if (!athena) throw new NotFoundException('Projeto ATHENA não encontrado');
    await requireProjectAccess(this.prisma, userId, athenaProjectId);
    const mapped = await this.prisma.integrationProjectMapping.findFirst({ where: { projectId: athenaProjectId, resourceKind: 'OPENPROJECT_PROJECT', externalId: String(externalProjectId), suspendedAt: null, connection: { workspaceId: athena.workspaceId, kind: IntegrationKind.OPENPROJECT, status: IntegrationStatus.CONNECTED } } });
    if (!mapped) throw new ForbiddenException('Este projeto OpenProject não está autorizado para o projeto ATHENA');
    const credentials = this.credentials(await this.integrations.activeCredentials(athena.workspaceId, IntegrationKind.OPENPROJECT));
    return this.safe(() => this.openProject.types(credentials, externalProjectId));
  }

  async form(userId: string, projectId: string, externalProjectId: number, typeId?: number, payload?: Record<string, unknown>) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (!project) throw new NotFoundException('Projeto ATHENA não encontrado');
    await requireProjectAccess(this.prisma, userId, projectId);
    const mapping = await this.prisma.integrationProjectMapping.findFirst({ where: { projectId, resourceKind: 'OPENPROJECT_PROJECT', externalId: String(externalProjectId), suspendedAt: null, connection: { workspaceId: project.workspaceId, kind: IntegrationKind.OPENPROJECT, status: IntegrationStatus.CONNECTED } } });
    if (!mapping) throw new ForbiddenException('Este projeto OpenProject não está autorizado para o projeto ATHENA');
    const credentials = this.credentials(await this.integrations.activeCredentials(project.workspaceId, IntegrationKind.OPENPROJECT));
    const formPayload = payload ?? { _links: { project: { href: `/api/v3/projects/${externalProjectId}` }, ...(typeId ? { type: { href: `/api/v3/types/${typeId}` } } : {}) } };
    return this.safe(() => this.openProject.form(credentials, formPayload));
  }

  async search(userId: string, projectId: string, externalProjectId: number, query: string) {
    const athenaProject = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (!athenaProject) throw new NotFoundException('Projeto ATHENA não encontrado');
    await requireProjectAccess(this.prisma, userId, projectId);
    const mapping = await this.prisma.integrationProjectMapping.findFirst({ where: { projectId, resourceKind: 'OPENPROJECT_PROJECT', externalId: String(externalProjectId), suspendedAt: null, connection: { workspaceId: athenaProject.workspaceId, kind: IntegrationKind.OPENPROJECT, status: IntegrationStatus.CONNECTED } } });
    if (!mapping) throw new ForbiddenException('Este projeto OpenProject não está autorizado para o projeto ATHENA');
    if (query.trim().length < 2) throw new BadRequestException('Digite pelo menos dois caracteres para buscar');
    const credentials = this.credentials(await this.integrations.activeCredentials(athenaProject.workspaceId, IntegrationKind.OPENPROJECT));
    return this.safe(() => this.openProject.searchWorkPackages(credentials, externalProjectId, query.trim().slice(0, 100)));
  }

  async searchMapped(userId: string, projectId: string, mappingId: string, query: string) {
    const mapping = await this.prisma.integrationProjectMapping.findFirst({ where: { id: mappingId, projectId, resourceKind: 'OPENPROJECT_PROJECT', suspendedAt: null } });
    if (!mapping) throw new ForbiddenException('Este projeto OpenProject não está autorizado para o projeto ATHENA');
    return this.search(userId, projectId, Number(mapping.externalId), query);
  }

  async artifact(userId: string, projectId: string, externalProjectId: number, externalId: number) {
    const athenaProject = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (!athenaProject) throw new NotFoundException('Projeto ATHENA não encontrado');
    await requireProjectAccess(this.prisma, userId, projectId);
    const mapping = await this.prisma.integrationProjectMapping.findFirst({ where: { projectId, resourceKind: 'OPENPROJECT_PROJECT', externalId: String(externalProjectId), suspendedAt: null, connection: { workspaceId: athenaProject.workspaceId, kind: IntegrationKind.OPENPROJECT, status: IntegrationStatus.CONNECTED } } });
    if (!mapping) throw new ForbiddenException('Este projeto OpenProject não está autorizado para o projeto ATHENA');
    const credentials = this.credentials(await this.integrations.activeCredentials(athenaProject.workspaceId, IntegrationKind.OPENPROJECT));
    const result = await this.safe(() => this.openProject.getWorkPackage(credentials, externalId));
    if (result.projectId !== externalProjectId) throw new BadRequestException('O work package não pertence ao destino selecionado');
    return result;
  }

  async taskCredentials(userId: string, projectId: string) {
    const targets = await this.mappings.targets(userId, projectId);
    const target = targets.find(row => row.resourceKind === 'OPENPROJECT_PROJECT');
    if (!target) throw new NotFoundException('Nenhum destino OpenProject está configurado para este projeto');
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { workspaceId: true } });
    return { workspaceId: project.workspaceId, connectionId: target.connectionId, credentials: this.credentials(await this.integrations.activeCredentials(project.workspaceId, IntegrationKind.OPENPROJECT)) };
  }

  async createWorkPackage(userId: string, projectId: string, mappingId: string, title: string, description: string, fields: Record<string, unknown> = {}) {
    const { workspaceId, connectionId, credentials, externalProjectId } = await this.taskDestination(userId, projectId, mappingId);
    const requestedLinks = fields.links && typeof fields.links === 'object' ? fields.links as Record<string, unknown> : {};
    const scalarFields = fields.values && typeof fields.values === 'object' ? fields.values as Record<string, unknown> : {};
    const payload: Record<string, unknown> = { ...scalarFields, subject: title, description: { format: 'markdown', raw: description }, _links: { ...requestedLinks, project: { href: `/api/v3/projects/${externalProjectId}` } } };
    const artifact = await this.safe(() => this.openProject.createWorkPackage(credentials, payload));
    if (artifact.projectId !== externalProjectId) throw new BadRequestException('O OpenProject criou o item fora do projeto selecionado');
    return { workspaceId, connectionId, externalProjectId, artifact };
  }

  async mappedArtifact(userId: string, projectId: string, mappingId: string, remoteId: string) {
    const { workspaceId, connectionId, credentials, externalProjectId } = await this.taskDestination(userId, projectId, mappingId);
    const id = Number(remoteId);
    if (!Number.isInteger(id) || id < 1) throw new BadRequestException('Identificador de work package inválido');
    const artifact = await this.safe(() => this.openProject.getWorkPackage(credentials, id));
    if (artifact.projectId !== externalProjectId) throw new BadRequestException('O work package não pertence ao projeto mapeado');
    return { workspaceId, connectionId, externalProjectId, artifact };
  }

  private async taskDestination(userId: string, projectId: string, mappingId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (!project) throw new NotFoundException('Projeto ATHENA não encontrado');
    await requireProjectAccess(this.prisma, userId, projectId, true);
    const mapping = await this.prisma.integrationProjectMapping.findFirst({ where: { id: mappingId, projectId, resourceKind: 'OPENPROJECT_PROJECT', suspendedAt: null, connection: { workspaceId: project.workspaceId, kind: IntegrationKind.OPENPROJECT, status: IntegrationStatus.CONNECTED } } });
    if (!mapping) throw new ForbiddenException('Este projeto OpenProject não está autorizado para o projeto ATHENA');
    return { workspaceId: project.workspaceId, connectionId: mapping.connectionId, externalProjectId: Number(mapping.externalId), credentials: this.credentials(await this.integrations.activeCredentials(project.workspaceId, IntegrationKind.OPENPROJECT)) };
  }

  private async safe<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof OpenProjectApiError) {
        const status = error.code === 'AUTHENTICATION' ? 401 : error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION' ? 422 : error.code === 'UNSAFE_HOST' ? 400 : 502;
        throw new HttpException({ code: error.code, message: error.message, fields: error.fields }, status);
      }
      throw error;
    }
  }
}
