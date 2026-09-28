import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationKind, IntegrationStatus, IntegrationTaskOperationStatus, RequirementStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../core/prisma.service';
import { IntegrationsService } from './integrations.service';
import { IntegrationMappingsService } from './integration-mappings.service';
import { GithubAdapter, GithubApiError, mapGithubError } from './github.adapter';
import { OpenProjectService } from './openproject.service';
import { requireProjectAccess } from '../common/project-access';
import { resolveAppOrigin } from '../common/public-origin';

@Injectable()
export class ExternalTasksService {
  constructor(private readonly prisma: PrismaService, private readonly integrations: IntegrationsService, private readonly mappings: IntegrationMappingsService, private readonly github: GithubAdapter, private readonly openProject: OpenProjectService) {}

  private sourceDescription(description: string, projectId: string, requirementId: string, code: string, revision: number) {
    const production = process.env.NODE_ENV === 'production';
    const configuredOrigin = process.env.APP_ORIGIN ?? process.env.WEB_ORIGIN?.split(',')[0] ?? (production ? undefined : 'http://localhost:5173');
    const origin = resolveAppOrigin(configuredOrigin, production);
    const marker = `Origem: ${code} (revisão ${revision})`;
    const markerIndex = description.lastIndexOf(`Origem: ${code} (revisão `);
    let content = description;
    if (markerIndex >= 0) {
      const trailingSection = description.slice(markerIndex).trimEnd();
      if (trailingSection.split(/\r?\n/).length <= 2) content = description.slice(0, markerIndex).trimEnd();
    }
    const sourceUrl = new URL(`/projects/${encodeURIComponent(projectId)}/requirements/${encodeURIComponent(requirementId)}/edit`, origin).toString();
    return `${content.trimEnd()}${content.trim() ? '\n\n' : ''}${marker}\n${sourceUrl}`;
  }

  private async integrationActivity(userId: string, projectId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
    await this.prisma.activityLog.create({ data: { userId, projectId, action, entityId, metadata: metadata as any } }).catch(() => undefined);
  }

  private async requirement(userId: string, id: string, edit = false) {
    const row = await this.prisma.requirement.findUnique({ where: { id }, include: { project: { select: { id: true, workspaceId: true, key: true, name: true } } } });
    if (!row) throw new NotFoundException('US não encontrada');
    const access = await requireProjectAccess(this.prisma, userId, row.project.id, edit);
    if (edit && (row.status === RequirementStatus.ARCHIVED || row.archivedAt)) throw new ConflictException('US arquivada não aceita tarefas');
    return { row, member: access.role };
  }

  async list(userId: string, requirementId: string) {
    const { row } = await this.requirement(userId, requirementId);
    return this.prisma.externalArtifactLink.findMany({ where: { requirementId, connection: { workspaceId: row.project.workspaceId } }, include: { connection: { select: { kind: true, accountLabel: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async searchGithub(userId: string, projectId: string, mappingId: string, query: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, workspaceId: true } });
    if (!project) throw new NotFoundException('Projeto ATHENA não encontrado');
    await requireProjectAccess(this.prisma, userId, project.id, true);
    if (query.trim().length < 2) throw new ConflictException('Digite pelo menos dois caracteres para buscar');
    const mapping = await this.prisma.integrationProjectMapping.findFirst({ where: { id: mappingId, projectId, resourceKind: 'GITHUB_REPOSITORY', suspendedAt: null, connection: { workspaceId: project.workspaceId, kind: IntegrationKind.GITHUB, status: IntegrationStatus.CONNECTED } } });
    if (!mapping) throw new ForbiddenException('Este repositório não está autorizado para o projeto ATHENA');
    const [owner, repository] = mapping.externalId.split('/');
    const token = (await this.integrations.activeCredentials(project.workspaceId, IntegrationKind.GITHUB)).token;
    try { return await this.github.findIssue(token, owner, repository, query.trim().slice(0, 100)); } catch (error) { return mapGithubError(error); }
  }

  async create(userId: string, requirementId: string, input: { provider: 'GITHUB'|'OPENPROJECT'; mappingId: string; title: string; description: string; providerFields?: Record<string, unknown> }, idempotencyKey?: string) {
    const { row } = await this.requirement(userId, requirementId, true);
    const mapping = await this.prisma.integrationProjectMapping.findFirst({ where: { id: input.mappingId, projectId: row.project.id, suspendedAt: null, connection: { workspaceId: row.project.workspaceId, kind: input.provider as IntegrationKind, status: IntegrationStatus.CONNECTED } }, include: { connection: true } });
    if (!mapping) throw new ForbiddenException('Destino de integração não autorizado para esta US');
    const key = idempotencyKey?.trim().slice(0, 200) || randomUUID();
    const fingerprint = createHash('sha256').update(JSON.stringify({ requirementId, provider: input.provider, mappingId: mapping.id, title: input.title, description: input.description, fields: input.providerFields ?? {} })).digest('hex');
    const prior = await this.prisma.integrationTaskOperation.findUnique({ where: { idempotencyKey: key } });
    if (prior) {
      if (prior.requestFingerprint !== fingerprint || prior.requirementId !== requirementId) throw new ConflictException('Chave de publicação já utilizada com outro conteúdo');
      if (prior.status === IntegrationTaskOperationStatus.COMPLETED && prior.remoteId) {
        const linked = await this.prisma.externalArtifactLink.findFirst({ where: { connectionId: mapping.connectionId, remoteId: prior.remoteId, requirementId } });
        if (linked) return linked;
        throw new ConflictException('A operação foi concluída, mas o vínculo local precisa ser recuperado consultando o item remoto.');
      }
      if (prior.status === IntegrationTaskOperationStatus.PENDING || prior.status === IntegrationTaskOperationStatus.UNKNOWN) throw new ConflictException({ code: 'PUBLICATION_UNCERTAIN', message: 'A publicação anterior ainda pode ter sido concluída. Consulte os itens vinculados antes de tentar novamente.' });
    }
    const operation = prior
      ? await this.prisma.integrationTaskOperation.update({ where: { id: prior.id }, data: { status: IntegrationTaskOperationStatus.PENDING, errorCode: null } })
      : await this.prisma.integrationTaskOperation.create({ data: { idempotencyKey: key, connectionId: mapping.connectionId, requirementId, action: 'CREATE', requestFingerprint: fingerprint, status: IntegrationTaskOperationStatus.PENDING } });
    let remoteArtifact: { type: string; id: string } | null = null;
    let projectTitle: string | null = null;
    try {
      let link: any;
      const description = this.sourceDescription(input.description, row.project.id, row.id, row.code, row.revision);
      if (input.provider === 'GITHUB') {
        const target = mapping.externalId.split('/');
        if (target.length !== 2) throw new ConflictException('Repositório GitHub configurado inválido');
        const token = (await this.integrations.activeCredentials(row.project.workspaceId, IntegrationKind.GITHUB)).token;
        const issue = await this.github.createIssue(token, target[0], target[1], input.title, description);
        remoteArtifact = { type: 'GITHUB_ISSUE', id: String(issue.number) };
        let projectFailure: string | null = null;
        const projectMappingId = typeof input.providerFields?.projectMappingId === 'string' ? input.providerFields.projectMappingId : undefined;
        if (projectMappingId) {
          try {
            const projectMapping = await this.prisma.integrationProjectMapping.findFirst({ where: { id: projectMappingId, projectId: row.project.id, connectionId: mapping.connectionId, resourceKind: 'GITHUB_PROJECT', suspendedAt: null } });
            if (!projectMapping) throw new ConflictException('GitHub Project não autorizado');
            projectTitle = projectMapping.externalName;
            const settings = projectMapping.settings as any;
            const fieldId = typeof input.providerFields?.fieldId === 'string' ? input.providerFields.fieldId : undefined;
            const optionId = typeof input.providerFields?.optionId === 'string' ? input.providerFields.optionId : undefined;
            await this.github.addIssueToProject(token, projectMapping.externalId, issue.nodeId, fieldId && optionId ? { id: fieldId, optionId } : undefined);
            input.providerFields = { ...(input.providerFields ?? {}), projectMappingId: projectMapping.id, projectTitle: projectMapping.externalName, ...(settings ? { projectSettings: settings } : {}) };
          } catch (error) { projectFailure = error instanceof Error ? error.message : 'Falha ao incluir no GitHub Project'; }
        }
        link = await this.prisma.externalArtifactLink.upsert({ where: { connectionId_remoteType_remoteId: { connectionId: mapping.connectionId, remoteType: 'GITHUB_ISSUE', remoteId: String(issue.number) } }, create: { connectionId: mapping.connectionId, requirementId, remoteType: 'GITHUB_ISSUE', remoteId: String(issue.number), url: issue.url, title: issue.title, remoteStatus: issue.state, remoteUpdatedAt: issue.updatedAt ? new Date(issue.updatedAt) : null, snapshotRevision: row.revision, linkedByUserId: userId, remoteMetadata: { repository: mapping.externalId, issueNodeId: issue.nodeId, projectFailure, projectMappingId } }, update: { requirementId, url: issue.url, title: issue.title, remoteStatus: issue.state, remoteUpdatedAt: issue.updatedAt ? new Date(issue.updatedAt) : null, remoteMetadata: { repository: mapping.externalId, issueNodeId: issue.nodeId, projectFailure, projectMappingId } } });
      } else {
        const created = await this.openProject.createWorkPackage(userId, row.project.id, mapping.id, input.title, description, input.providerFields);
        remoteArtifact = { type: 'OPENPROJECT_WORK_PACKAGE', id: String(created.artifact.id) };
        link = await this.prisma.externalArtifactLink.upsert({ where: { connectionId_remoteType_remoteId: { connectionId: mapping.connectionId, remoteType: 'OPENPROJECT_WORK_PACKAGE', remoteId: String(created.artifact.id) } }, create: { connectionId: mapping.connectionId, requirementId, remoteType: 'OPENPROJECT_WORK_PACKAGE', remoteId: String(created.artifact.id), url: created.artifact.url, title: created.artifact.subject, remoteStatus: created.artifact.status, remoteUpdatedAt: created.artifact.updatedAt ? new Date(created.artifact.updatedAt) : null, snapshotRevision: row.revision, linkedByUserId: userId }, update: { requirementId, url: created.artifact.url, title: created.artifact.subject, remoteStatus: created.artifact.status, remoteUpdatedAt: created.artifact.updatedAt ? new Date(created.artifact.updatedAt) : null } });
      }
      await this.prisma.integrationTaskOperation.update({ where: { id: operation.id }, data: { status: IntegrationTaskOperationStatus.COMPLETED, remoteType: link.remoteType, remoteId: link.remoteId } });
      await this.integrationActivity(userId, row.project.id, `INTEGRATION_${input.provider}_TASK_CREATED`, link.id, {
        provider: input.provider, externalTitle: link.title, remoteId: link.remoteId, url: link.url, remoteStatus: link.remoteStatus,
        project: { id: row.project.id, key: row.project.key, name: row.project.name }, requirement: { id: row.id, code: row.code, title: row.title },
      });
      if (input.provider === 'GITHUB' && typeof input.providerFields?.projectMappingId === 'string') {
        const projectMetadata = link.remoteMetadata && typeof link.remoteMetadata === 'object' ? link.remoteMetadata as Record<string, unknown> : {};
        const projectFailure = typeof projectMetadata.projectFailure === 'string' ? projectMetadata.projectFailure : null;
        await this.integrationActivity(userId, row.project.id, projectFailure ? 'INTEGRATION_GITHUB_TASK_PROJECT_FAILED' : 'INTEGRATION_GITHUB_TASK_PROJECT_LINKED', link.id, {
          provider: input.provider, externalTitle: link.title, projectTitle: projectTitle ?? projectMetadata.projectTitle ?? null,
          remoteId: link.remoteId, url: link.url, error: projectFailure,
          project: { id: row.project.id, key: row.project.key, name: row.project.name }, requirement: { id: row.id, code: row.code, title: row.title },
        });
      }
      return link;
    } catch (error) {
      const errorCode = String((error as any)?.code ?? 'UPSTREAM');
      const status = error instanceof HttpException ? error.getStatus() : 0;
      const responseCode = error instanceof HttpException ? String((error.getResponse() as any)?.code ?? '') : '';
      const uncertain = Boolean(remoteArtifact) || errorCode === 'NETWORK' || responseCode === 'NETWORK' || status === 502 || errorCode === 'UPSTREAM' && !(error instanceof HttpException);
      await this.prisma.integrationTaskOperation.update({ where: { id: operation.id }, data: { status: uncertain ? IntegrationTaskOperationStatus.UNKNOWN : IntegrationTaskOperationStatus.FAILED, errorCode: errorCode.slice(0, 80), ...(remoteArtifact ? { remoteType: remoteArtifact.type, remoteId: remoteArtifact.id } : {}) } }).catch(() => undefined);
      await this.integrationActivity(userId, row.project.id, `INTEGRATION_${input.provider}_TASK_${uncertain ? 'UNKNOWN' : 'FAILED'}`, operation.id, {
        provider: input.provider, title: input.title, remoteId: remoteArtifact?.id ?? null, error: error instanceof Error ? error.message : errorCode,
        project: { id: row.project.id, key: row.project.key, name: row.project.name }, requirement: { id: row.id, code: row.code, title: row.title },
      });
      if (input.provider === 'GITHUB' && error instanceof GithubApiError) return mapGithubError(error);
      throw error;
    }
  }

  async link(userId: string, requirementId: string, input: { provider: 'GITHUB'|'OPENPROJECT'; mappingId: string; remoteId: string }) {
    const { row } = await this.requirement(userId, requirementId, true);
    const mapping = await this.prisma.integrationProjectMapping.findFirst({ where: { id: input.mappingId, projectId: row.project.id, suspendedAt: null, connection: { workspaceId: row.project.workspaceId, kind: input.provider as IntegrationKind, status: IntegrationStatus.CONNECTED } } });
    if (!mapping) throw new ForbiddenException('Destino de integração não autorizado para esta US');
    try {
      let artifact: any; let type: string; let connectionId = mapping.connectionId;
      if (input.provider === 'GITHUB') {
        const [owner, repository] = mapping.externalId.split('/');
        const token = (await this.integrations.activeCredentials(row.project.workspaceId, IntegrationKind.GITHUB)).token;
        try { artifact = await this.github.getIssue(token, owner, repository, Number(input.remoteId)); } catch (e) { return mapGithubError(e); }
        type = 'GITHUB_ISSUE';
      } else {
        const result = await this.openProject.mappedArtifact(userId, row.project.id, mapping.id, input.remoteId);
        artifact = result.artifact; connectionId = result.connectionId; type = 'OPENPROJECT_WORK_PACKAGE';
      }
      const remoteId = String(artifact.number ?? artifact.id);
      const currentLink = await this.prisma.externalArtifactLink.findUnique({ where: { connectionId_remoteType_remoteId: { connectionId, remoteType: type, remoteId } } });
      if (currentLink && currentLink.requirementId !== requirementId) throw new ConflictException('Este item externo já está vinculado a outra US neste projeto');
      if (currentLink) return currentLink;
      const link = await this.prisma.externalArtifactLink.create({ data: { connectionId, requirementId, remoteType: type, remoteId, url: artifact.url, title: artifact.title ?? artifact.subject, remoteStatus: artifact.state ?? artifact.status, remoteUpdatedAt: artifact.updatedAt ? new Date(artifact.updatedAt) : null, snapshotRevision: row.revision, linkedByUserId: userId } });
      await this.integrationActivity(userId, row.project.id, `INTEGRATION_${input.provider}_TASK_LINKED`, link.id, {
        provider: input.provider, externalTitle: link.title, remoteId: link.remoteId, url: link.url, remoteStatus: link.remoteStatus,
        project: { id: row.project.id, key: row.project.key, name: row.project.name }, requirement: { id: row.id, code: row.code, title: row.title },
      });
      return link;
    } catch (error) {
      await this.integrationActivity(userId, row.project.id, `INTEGRATION_${input.provider}_TASK_FAILED`, input.mappingId, {
        provider: input.provider, taskAction: 'LINK', remoteId: input.remoteId, error: error instanceof Error ? error.message : 'Falha ao vincular tarefa',
        project: { id: row.project.id, key: row.project.key, name: row.project.name }, requirement: { id: row.id, code: row.code, title: row.title },
      });
      if (input.provider === 'GITHUB' && error instanceof GithubApiError) return mapGithubError(error);
      throw error;
    }
  }

  async attachGithubProject(userId: string, requirementId: string, linkId: string, input: { projectMappingId: string; fieldId?: string; optionId?: string }) {
    const { row } = await this.requirement(userId, requirementId, true);
    let link: any = null;
    let projectTitle: string | null = null;
    try {
      link = await this.prisma.externalArtifactLink.findFirst({ where: { id: linkId, requirementId, remoteType: 'GITHUB_ISSUE', connection: { workspaceId: row.project.workspaceId, kind: IntegrationKind.GITHUB } } });
      if (!link) throw new NotFoundException('Issue vinculada não encontrada');
        const project = await this.prisma.integrationProjectMapping.findFirst({ where: { id: input.projectMappingId, projectId: row.project.id, connectionId: link.connectionId, resourceKind: 'GITHUB_PROJECT', suspendedAt: null } });
      if (!project) throw new ForbiddenException('GitHub Project não autorizado para este projeto ATHENA');
      projectTitle = project.externalName;
      const metadata = link.remoteMetadata as any;
      if (!metadata?.issueNodeId) throw new ConflictException('A referência da Issue está incompleta para inclusão no Project');
      const token = (await this.integrations.activeCredentials(row.project.workspaceId, IntegrationKind.GITHUB)).token;
      await this.github.addIssueToProject(token, project.externalId, metadata.issueNodeId, input.fieldId && input.optionId ? { id: input.fieldId, optionId: input.optionId } : undefined);
      const updated = await this.prisma.externalArtifactLink.update({ where: { id: link.id }, data: { remoteMetadata: { ...metadata, projectMappingId: project.id, projectFailure: null } } });
      await this.integrationActivity(userId, row.project.id, 'INTEGRATION_GITHUB_TASK_PROJECT_LINKED', link.id, {
        provider: 'GITHUB', externalTitle: link.title, projectTitle: project.externalName, remoteId: link.remoteId, url: link.url,
        project: { id: row.project.id, key: row.project.key, name: row.project.name }, requirement: { id: row.id, code: row.code, title: row.title },
      });
      return updated;
    } catch (error) {
      await this.integrationActivity(userId, row.project.id, 'INTEGRATION_GITHUB_TASK_PROJECT_FAILED', link?.id ?? linkId, {
        provider: 'GITHUB', externalTitle: link?.title ?? 'GitHub Project', projectTitle, remoteId: link?.remoteId ?? null, url: link?.url ?? null,
        error: error instanceof Error ? error.message : 'Falha ao incluir no GitHub Project',
        project: { id: row.project.id, key: row.project.key, name: row.project.name }, requirement: { id: row.id, code: row.code, title: row.title },
      });
      if (error instanceof GithubApiError) return mapGithubError(error);
      throw error;
    }
  }
}
