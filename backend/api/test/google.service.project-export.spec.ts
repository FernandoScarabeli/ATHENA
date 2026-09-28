import { ForbiddenException } from '@nestjs/common';
import { GoogleService } from '../src/integrations/google.service';

describe('GoogleService project export roots', () => {
  const ownerMember = { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER', workspace: { archivedAt: null } }) };

  it('makes the first linked folder the project root and keeps later links as import links', async () => {
    const created: any[] = [];
    const tx = {
      googleDriveFolderLink: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockImplementation(async () => created.length ? { id: created[0].id } : null),
        create: jest.fn().mockImplementation(async ({ data }) => { const link = { id: `link-${created.length + 1}`, ...data }; created.push(link); return link; }),
      },
    };
    const sync = { syncNow: jest.fn().mockResolvedValue({ status: 'COMPLETED' }), queueProjectFolders: jest.fn().mockResolvedValue(undefined) };
    const service = new GoogleService({
      workspaceMember: ownerMember,
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      integrationConnection: { findUnique: jest.fn().mockResolvedValue({ id: 'connection-1' }) },
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }), findUnique: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1', archivedAt: null }) },
      $transaction: jest.fn(async work => work(tx)),
    } as never, {} as never, {} as never, {} as never, {} as never, sync as never);

    const first = await service.linkFolder('owner', 'workspace-1', 'drive-root-a', 'Raiz A', 'project-1');
    const second = await service.linkFolder('owner', 'workspace-1', 'drive-root-b', 'Raiz B', 'project-1');

    expect(first.isExportRoot).toBe(true);
    expect(second.isExportRoot).toBe(false);
    expect(sync.queueProjectFolders).toHaveBeenCalledWith('project-1', 'link-1');
  });

  it('does not attach a legacy folder to a project when it already owns a US from another project', async () => {
    const tx = {
      googleDriveFolderLink: { findUnique: jest.fn().mockResolvedValue({ id: 'legacy-link', projectId: null }) },
      integrationSource: { findMany: jest.fn().mockResolvedValue([{ canonicalRequirement: { projectId: 'another-project' } }]) },
    };
    const service = new GoogleService({
      workspaceMember: ownerMember,
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      integrationConnection: { findUnique: jest.fn().mockResolvedValue({ id: 'connection-1' }) },
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }), findUnique: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1', archivedAt: null }) },
      $transaction: jest.fn(async work => work(tx)),
    } as never, {} as never, {} as never, {} as never, {} as never, { syncNow: jest.fn() } as never);

    await expect(service.linkFolder('owner', 'workspace-1', 'drive-root', 'Drive', 'project-1')).rejects.toThrow('US vinculadas a outro projeto');
  });

  it('allows Managers to configure project roots but rejects Editors', async () => {
    const tx = { googleDriveFolderLink: { updateMany: jest.fn(), update: jest.fn() } };
    const workspaceMember = { findUnique: jest.fn().mockResolvedValue({ role: 'MANAGER', workspace: { archivedAt: null } }) };
    const prisma: any = {
      workspaceMember,
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      googleDriveFolderLink: { findFirst: jest.fn().mockResolvedValue({ id: 'link-2', projectId: 'project-1' }), findUnique: jest.fn().mockResolvedValue({ id: 'link-2', isExportRoot: true }) },
      $transaction: jest.fn(async work => work(tx)),
    };
    const service = new GoogleService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    await expect(service.setExportRoot('manager', 'workspace-1', 'link-2')).resolves.toMatchObject({ isExportRoot: true });
    workspaceMember.findUnique.mockResolvedValue({ role: 'EDITOR', workspace: { archivedAt: null } });
    await expect(service.setExportRoot('editor', 'workspace-1', 'link-2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('replaces the selected root in one transaction and prepares project folders on it', async () => {
    const tx = { googleDriveFolderLink: { updateMany: jest.fn(), update: jest.fn() } };
    const sync = { queueProjectFolders: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      workspaceMember: ownerMember,
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      googleDriveFolderLink: {
        findFirst: jest.fn().mockResolvedValue({ id: 'link-2', projectId: 'project-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'link-2', isExportRoot: true }),
      },
      $transaction: jest.fn(async work => work(tx)),
    };
    const service = new GoogleService(prisma as never, {} as never, {} as never, {} as never, {} as never, sync as never);

    await expect(service.setExportRoot('owner', 'workspace-1', 'link-2')).resolves.toMatchObject({ isExportRoot: true });
    expect(tx.googleDriveFolderLink.updateMany).toHaveBeenCalledWith({ where: { projectId: 'project-1', isExportRoot: true }, data: { isExportRoot: false } });
    expect(tx.googleDriveFolderLink.update).toHaveBeenCalledWith({ where: { id: 'link-2' }, data: { isExportRoot: true } });
    expect(sync.queueProjectFolders).toHaveBeenCalledWith('project-1', 'link-2');
  });
});
