import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { RequirementsService } from '../src/requirements/requirements.service';

const project = { id: 'project-1', name: 'Portal', key: 'PORTAL', workspaceId: 'workspace-1', archivedAt: null };

function ownerMembership(workspaceId = 'workspace-1', role: WorkspaceRole = WorkspaceRole.OWNER) {
  return { workspaceId, userId: 'owner-1', role, workspace: { archivedAt: null } };
}

function transactionClient(overrides: Record<string, unknown> = {}) {
  const tx: any = {
    workspaceMember: { findUnique: jest.fn(async ({ where }: any) => ownerMembership(where.workspaceId)) },
    workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }), update: jest.fn().mockResolvedValue({ id: 'workspace-1' }) },
    project: {
      findUnique: jest.fn().mockResolvedValue(project),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ ...project, workspaceId: 'workspace-2', key: 'NEW' }),
    },
    integrationProjectMapping: { count: jest.fn().mockResolvedValue(1), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    googleDriveFolderLink: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    workspaceMemberCount: jest.fn(),
    projectMember: { count: jest.fn().mockResolvedValue(2) },
    requirementFolder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    accessRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    ...overrides,
  };
  tx.workspaceMember.count = jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.workspaceId === 'workspace-1' ? 3 : 5));
  return tx;
}

function serviceWithTransaction(tx: any) {
  const prisma: any = {
    workspaceMember: { findUnique: jest.fn(async ({ where }: any) => ownerMembership(where.workspaceId)) },
    project: { findUnique: jest.fn().mockResolvedValue(project) },
    workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'workspace-2', name: 'Destino', archivedAt: null }) },
    $transaction: jest.fn((work: (client: any) => Promise<unknown>) => work(tx)),
  };
  return { prisma, service: new RequirementsService(prisma) };
}

describe('workspace and project management', () => {
  it('returns archived workspaces and projects only for Owners when requested', async () => {
    const findMany = jest.fn().mockResolvedValue([{
      role: WorkspaceRole.OWNER,
      workspace: {
        id: 'workspace-1', name: 'Produto', archivedAt: new Date(),
        projects: [
          { id: 'active-project', name: 'Ativo', key: 'ACT', archivedAt: null },
          { id: 'archived-project', name: 'Arquivado', key: 'ARC', archivedAt: new Date() },
        ],
      },
    }]);
    const prisma: any = { workspaceMember: { findMany }, projectMember: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new RequirementsService(prisma);

    await expect(service.workspaces('owner-1')).resolves.toEqual([]);
    await expect(service.workspaces('owner-1', true)).resolves.toEqual([expect.objectContaining({
      id: 'workspace-1', archivedAt: expect.any(Date), role: WorkspaceRole.OWNER,
      projects: expect.arrayContaining([
        expect.objectContaining({ id: 'active-project', archivedAt: null }),
        expect.objectContaining({ id: 'archived-project', archivedAt: expect.any(Date) }),
      ]),
    })]);
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      select: expect.objectContaining({ workspace: expect.objectContaining({ select: expect.objectContaining({ projects: expect.objectContaining({ where: {} }) }) }) }),
    }));
  });

  it('shows archived projects to Managers but never exposes archived workspaces to them', async () => {
    const prisma: any = {
      workspaceMember: { findMany: jest.fn().mockResolvedValue([{
        role: WorkspaceRole.MANAGER,
        workspace: { id: 'workspace-1', name: 'Produto', archivedAt: null, projects: [
          { id: 'active-project', name: 'Ativo', key: 'ACT', archivedAt: null },
          { id: 'archived-project', name: 'Arquivado', key: 'ARC', archivedAt: new Date() },
        ] },
      }]) },
      projectMember: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new RequirementsService(prisma);

    await expect(service.workspaces('manager-1', true)).resolves.toEqual([expect.objectContaining({
      role: WorkspaceRole.MANAGER,
      projects: expect.arrayContaining([expect.objectContaining({ id: 'archived-project' })]),
    })]);
    expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ workspace: expect.objectContaining({ select: expect.objectContaining({ projects: expect.objectContaining({ where: {} }) }) }) }),
    }));
  });

  it('allows Managers to create, edit, archive, restore and permanently delete projects, but not edit the workspace', async () => {
    let currentProject = { ...project };
    const manager = { workspaceId: 'workspace-1', userId: 'manager-1', role: WorkspaceRole.MANAGER, workspace: { archivedAt: null } };
    const tx: any = {
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(manager) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      project: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockImplementation(async () => currentProject),
        create: jest.fn().mockImplementation(async ({ data }: any) => { currentProject = { id: 'created-project', ...data, archivedAt: null }; return currentProject; }),
        update: jest.fn().mockImplementation(async ({ data }: any) => { currentProject = { ...currentProject, ...data }; return currentProject; }),
        delete: jest.fn().mockResolvedValue({ id: currentProject.id }),
      },
      requirementFolder: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'folder-1' }), count: jest.fn().mockResolvedValue(0), deleteMany: jest.fn() },
      integrationProjectMapping: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      googleDriveFolderLink: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      requirement: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma: any = {
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(manager) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      project: {
        findUnique: jest.fn().mockImplementation(async () => currentProject),
        update: jest.fn().mockImplementation(async ({ data }: any) => { currentProject = { ...currentProject, ...data }; return currentProject; }),
      },
      $transaction: jest.fn((work: (client: any) => Promise<unknown>) => work(tx)),
    };
    const service = new RequirementsService(prisma);

    await service.createProject('manager-1', 'workspace-1', 'Novo projeto', 'NEW');
    expect(currentProject).toMatchObject({ name: 'Novo projeto', key: 'NEW' });
    await service.updateProject('manager-1', 'created-project', { name: 'Portal atualizado' });
    expect(currentProject.name).toBe('Portal atualizado');
    await service.archiveProject('manager-1', 'created-project');
    expect(currentProject.archivedAt).toBeInstanceOf(Date);
    await service.restoreProject('manager-1', 'created-project');
    expect(currentProject.archivedAt).toBeNull();
    await service.archiveProject('manager-1', 'created-project');
    await service.permanentlyDeleteProject('manager-1', 'created-project', { confirmationName: 'Portal atualizado' });
    expect(tx.project.delete).toHaveBeenCalledWith({ where: { id: 'created-project' } });

    await expect(service.updateWorkspace('manager-1', 'workspace-1', { name: 'Outro nome' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.archiveWorkspace('manager-1', 'workspace-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateMember('manager-1', 'workspace-1', 'target-user', { role: WorkspaceRole.MANAGER } as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.moveProject('manager-1', 'created-project', { targetWorkspaceId: 'workspace-2' } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an Owner before archiving and pauses integration links in the same transaction', async () => {
    const tx = transactionClient({ project: {
      findMany: jest.fn().mockResolvedValue([{ id: project.id }]),
      update: jest.fn(),
    } });
    const { prisma, service } = serviceWithTransaction(tx);

    prisma.workspaceMember.findUnique.mockResolvedValue(ownerMembership('workspace-1', WorkspaceRole.VIEWER));
    await expect(service.archiveWorkspace('owner-1', 'workspace-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    prisma.workspaceMember.findUnique.mockResolvedValue(ownerMembership());

    await service.archiveWorkspace('owner-1', 'workspace-1');

    expect(tx.workspace.update).toHaveBeenCalledWith({ where: { id: 'workspace-1' }, data: { archivedAt: expect.any(Date) } });
    expect(tx.integrationProjectMapping.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: { in: [project.id] }, suspendedAt: null } }));
    expect(tx.googleDriveFolderLink.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ suspendedAt: expect.any(Date), syncLeaseId: null }) }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects permanent deletion until archived and requires the exact item name', async () => {
    const tx: any = {
      project: { findUnique: jest.fn().mockResolvedValue({ ...project, archivedAt: null }), delete: jest.fn() },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(ownerMembership()) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      googleDriveFolderLink: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      requirement: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
      requirementFolder: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), deleteMany: jest.fn() },
    };
    const prisma: any = {
      $transaction: jest.fn((work: (client: any) => Promise<unknown>) => work(tx)),
    };
    const service = new RequirementsService(prisma);

    await expect(service.permanentlyDeleteProject('owner-1', project.id, { confirmationName: 'Portal' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.project.delete).not.toHaveBeenCalled();
    tx.project.findUnique.mockResolvedValue({ ...project, archivedAt: new Date() });
    await expect(service.permanentlyDeleteProject('owner-1', project.id, { confirmationName: 'Outro' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.project.delete).not.toHaveBeenCalled();
    await expect(service.permanentlyDeleteProject('owner-1', project.id, { confirmationName: 'Portal' })).resolves.toEqual({ ok: true });
    expect(tx.requirement.deleteMany).toHaveBeenCalledWith({ where: { projectId: project.id } });
    expect(tx.googleDriveFolderLink.deleteMany).toHaveBeenCalledWith({ where: { projectId: project.id } });
    expect(tx.requirementFolder.findMany).toHaveBeenCalledWith({ where: { projectId: project.id, children: { none: {} } }, select: { id: true } });
    expect(tx.project.delete).toHaveBeenCalledWith({ where: { id: project.id } });
  });

  it('permanently deletes an archived workspace and its local project and Drive data', async () => {
    const tx: any = {
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(ownerMembership()) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'workspace-1', name: 'Origem', archivedAt: new Date() }), delete: jest.fn() },
      project: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }]) },
      requirement: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      googleDriveFolderLink: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      requirementFolder: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), deleteMany: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn((work: (client: any) => Promise<unknown>) => work(tx)) };
    const service = new RequirementsService(prisma);

    await service.permanentlyDeleteWorkspace('owner-1', 'workspace-1', { confirmationName: 'Origem' });

    expect(tx.requirement.deleteMany).toHaveBeenCalledWith({ where: { projectId: { in: ['p1'] } } });
    expect(tx.googleDriveFolderLink.deleteMany).toHaveBeenCalledWith({ where: { connection: { workspaceId: 'workspace-1' } } });
    expect(tx.requirementFolder.findMany).toHaveBeenCalledWith({ where: { workspaceId: 'workspace-1', children: { none: {} } }, select: { id: true } });
    expect(tx.workspace.delete).toHaveBeenCalledWith({ where: { id: 'workspace-1' } });
  });

  it('restores a project and resumes only integration links owned by its workspace', async () => {
    const tx = transactionClient({ project: { update: jest.fn().mockResolvedValue({ ...project, archivedAt: null }) } });
    const prisma: any = {
      project: { findUnique: jest.fn().mockResolvedValue({ ...project, archivedAt: new Date() }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(ownerMembership()) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      $transaction: jest.fn((work: (client: any) => Promise<unknown>) => work(tx)),
    };
    const service = new RequirementsService(prisma);

    await service.restoreProject('owner-1', project.id);

    expect(tx.project.update).toHaveBeenCalledWith({ where: { id: project.id }, data: { archivedAt: null } });
    expect(tx.integrationProjectMapping.updateMany).toHaveBeenCalledWith({ where: { projectId: { in: [project.id] }, suspendedAt: { not: null }, connection: { workspaceId: 'workspace-1' } }, data: { suspendedAt: null } });
    expect(tx.googleDriveFolderLink.updateMany).toHaveBeenCalledWith({ where: { projectId: { in: [project.id] }, suspendedAt: { not: null }, connection: { workspaceId: 'workspace-1' } }, data: { suspendedAt: null } });
  });

  it('moves a project with stable identity, access impact, and paused source integrations', async () => {
    const tx = transactionClient();
    const { service } = serviceWithTransaction(tx);

    const result = await service.moveProject('owner-1', project.id, { targetWorkspaceId: 'workspace-2', key: 'NEW' });

    expect(result).toMatchObject({
      id: project.id, workspaceId: 'workspace-2', key: 'NEW',
      accessImpact: {
        fromWorkspace: 'workspace-1', toWorkspace: 'workspace-2',
        sourceWorkspaceMembersLoseInheritedAccess: 3, destinationWorkspaceMembersGainInheritedAccess: 5,
        directProjectMembersRetained: 2, integrationsRequireReconnect: true,
      },
    });
    expect(tx.project.update).toHaveBeenCalledWith({ where: { id: project.id }, data: { workspaceId: 'workspace-2', key: 'NEW' } });
    expect(tx.requirementFolder.updateMany).toHaveBeenCalledWith({ where: { projectId: project.id }, data: { workspaceId: 'workspace-2' } });
    expect(tx.integrationProjectMapping.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: { in: [project.id] }, suspendedAt: null } }));
    expect(tx.googleDriveFolderLink.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ suspendedAt: expect.any(Date) }) }));
  });

  it('requires ownership in both workspaces and rejects a destination key conflict before moving', async () => {
    const tx = transactionClient({ project: {
      findUnique: jest.fn().mockResolvedValue(project),
      findFirst: jest.fn().mockResolvedValue({ id: 'duplicate' }),
      update: jest.fn(),
    } });
    const { prisma, service } = serviceWithTransaction(tx);
    prisma.workspaceMember.findUnique.mockImplementation(async ({ where }: any) => {
      const workspaceId = where.workspaceId_userId.workspaceId;
      return ownerMembership(workspaceId, workspaceId === 'workspace-2' ? WorkspaceRole.VIEWER : WorkspaceRole.OWNER);
    });

    await expect(service.moveProject('owner-1', project.id, { targetWorkspaceId: 'workspace-2', key: 'PORTAL' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    prisma.workspaceMember.findUnique.mockImplementation(async ({ where }: any) => ownerMembership(where.workspaceId_userId.workspaceId));
    await expect(service.moveProject('owner-1', project.id, { targetWorkspaceId: 'workspace-2', key: 'PORTAL' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.project.update).not.toHaveBeenCalled();
  });
});
