import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationKind, IntegrationStatus, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { requireProjectAccess, requireProjectManagerOrOwner } from '../common/project-access';

const readRoles = [WorkspaceRole.OWNER, WorkspaceRole.MANAGER, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER];
const resourceKinds: Record<IntegrationKind, string[]> = {
  GITHUB: ['GITHUB_REPOSITORY', 'GITHUB_PROJECT'],
  GOOGLE: [],
  OPENPROJECT: ['OPENPROJECT_PROJECT'],
};

@Injectable()
export class IntegrationMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async project(projectId: string, userId: string, manage = false) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    if (manage) {
      await requireProjectManagerOrOwner(this.prisma, userId, projectId);
      if (project.archivedAt) throw new NotFoundException('Este projeto está arquivado');
    } else await requireProjectAccess(this.prisma, userId, projectId);
    return project;
  }

  async list(userId: string, projectId: string) {
    const project = await this.project(projectId, userId);
    const rows = await this.prisma.integrationProjectMapping.findMany({ where: { projectId, suspendedAt: null, connection: { workspaceId: project.workspaceId } }, include: { connection: true }, orderBy: [{ resourceKind: 'asc' }, { externalName: 'asc' }] });
    return rows.map(({ connection, ...row }) => ({ ...row, connection: { id: connection.id, kind: connection.kind, status: connection.status, accountLabel: connection.accountLabel } }));
  }

  async save(userId: string, projectId: string, input: { connectionId: string; resourceKind: string; externalId: string; externalName: string; settings?: Record<string, unknown> }) {
    const project = await this.project(projectId, userId, true);
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: input.connectionId, workspaceId: project.workspaceId, status: IntegrationStatus.CONNECTED } });
    if (!connection) throw new NotFoundException('Conexão ativa não encontrada neste workspace');
    if (!resourceKinds[connection.kind].includes(input.resourceKind)) throw new BadRequestException('Tipo de destino incompatível com a integração');
    if (!input.externalId.trim() || input.externalId.length > 300 || !input.externalName.trim() || input.externalName.length > 300) throw new BadRequestException('Destino externo inválido');
    return this.prisma.integrationProjectMapping.upsert({
      where: { projectId_connectionId_resourceKind_externalId: { projectId, connectionId: connection.id, resourceKind: input.resourceKind, externalId: input.externalId } },
      create: { projectId, connectionId: connection.id, resourceKind: input.resourceKind, externalId: input.externalId, externalName: input.externalName.trim(), settings: input.settings as any },
      update: { externalName: input.externalName.trim(), settings: input.settings as any, suspendedAt: null },
    });
  }

  async remove(userId: string, projectId: string, mappingId: string) {
    const project = await this.project(projectId, userId, true);
    const row = await this.prisma.integrationProjectMapping.findFirst({ where: { id: mappingId, projectId, suspendedAt: null, connection: { workspaceId: project.workspaceId } } });
    if (!row) throw new NotFoundException('Destino vinculado não encontrado');
    await this.prisma.integrationProjectMapping.delete({ where: { id: mappingId } });
    return { id: mappingId, removed: true };
  }

  async targets(userId: string, projectId: string) {
    const project = await this.project(projectId, userId);
    const rows = await this.prisma.integrationProjectMapping.findMany({ where: { projectId, suspendedAt: null, connection: { workspaceId: project.workspaceId, status: IntegrationStatus.CONNECTED } }, include: { connection: true }, orderBy: [{ resourceKind: 'asc' }, { externalName: 'asc' }] });
    return rows.map(({ connection, ...row }) => ({ ...row, connection: { id: connection.id, kind: connection.kind, accountLabel: connection.accountLabel } }));
  }
}
