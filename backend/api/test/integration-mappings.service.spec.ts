import { ForbiddenException } from '@nestjs/common';
import { IntegrationKind, IntegrationStatus, WorkspaceRole } from '@prisma/client';
import { IntegrationMappingsService } from '../src/integrations/integration-mappings.service';

describe('IntegrationMappingsService project permissions', () => {
  const project = { id: 'project-1', workspaceId: 'workspace-1', archivedAt: null };
  const connection = { id: 'connection-1', workspaceId: 'workspace-1', kind: IntegrationKind.GITHUB, status: IntegrationStatus.CONNECTED, accountLabel: 'athena-team' };
  const mapping = { id: 'mapping-1', projectId: project.id, connectionId: connection.id, resourceKind: 'GITHUB_REPOSITORY', externalId: 'team/repo', externalName: 'team/repo', connection };

  function setup(role: WorkspaceRole) {
    const prisma: any = {
      project: { findUnique: jest.fn().mockResolvedValue(project) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role, workspace: { archivedAt: null } }) },
      projectMember: { findUnique: jest.fn().mockResolvedValue(null) },
      integrationConnection: { findFirst: jest.fn().mockResolvedValue(connection) },
      integrationProjectMapping: {
        findMany: jest.fn().mockResolvedValue([mapping]),
        upsert: jest.fn().mockResolvedValue(mapping),
        delete: jest.fn().mockResolvedValue({ id: mapping.id }),
        findFirst: jest.fn().mockResolvedValue(mapping),
      },
    };
    return { prisma, service: new IntegrationMappingsService(prisma) };
  }

  it('lets Managers add and remove project destinations using a connected workspace integration', async () => {
    const { prisma, service } = setup(WorkspaceRole.MANAGER);
    const input = { connectionId: connection.id, resourceKind: 'GITHUB_REPOSITORY', externalId: 'team/repo', externalName: 'team/repo' };

    await expect(service.save('manager', project.id, input)).resolves.toEqual(mapping);
    expect(prisma.integrationConnection.findFirst).toHaveBeenCalledWith({ where: { id: connection.id, workspaceId: project.workspaceId, status: IntegrationStatus.CONNECTED } });
    expect(prisma.integrationProjectMapping.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId_connectionId_resourceKind_externalId: { projectId: project.id, connectionId: connection.id, resourceKind: input.resourceKind, externalId: input.externalId } },
    }));
    await expect(service.remove('manager', project.id, mapping.id)).resolves.toEqual({ id: mapping.id, removed: true });
  });

  it('keeps project destination changes unavailable to Editors', async () => {
    const { prisma, service } = setup(WorkspaceRole.EDITOR);
    const input = { connectionId: connection.id, resourceKind: 'GITHUB_REPOSITORY', externalId: 'team/repo', externalName: 'team/repo' };

    await expect(service.save('editor', project.id, input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.integrationProjectMapping.upsert).not.toHaveBeenCalled();
  });
});
