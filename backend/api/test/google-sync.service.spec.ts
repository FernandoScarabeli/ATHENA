import { GoogleDriveOutboxOperation } from '@prisma/client';
import { createHash } from 'crypto';
import { GoogleSyncService } from '../src/integrations/google-sync.service';

describe('GoogleSyncService', () => {
  it('uses refreshed credentials for scheduled Drive reads', async () => {
    const credentials = { valid: jest.fn().mockResolvedValue({ accessToken: 'fresh-access' }) };
    const link = { id: 'link-1', connectionId: 'connection-1', projectId: 'project-1', externalId: 'drive-root', name: 'Raiz', connection: { workspaceId: 'workspace-1', status: 'CONNECTED' } };
    const prisma: any = {
      googleDriveFolderLink: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue(link), update: jest.fn() },
      googleDriveSyncRun: { create: jest.fn().mockResolvedValue({ id: 'run-1' }), update: jest.fn() },
      googleDriveFolderMapping: { findUnique: jest.fn().mockResolvedValue(null) },
      requirementFolder: { findFirst: jest.fn().mockResolvedValue({ id: 'fallback' }) },
      integrationSource: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const google: any = { listFolderFiles: jest.fn().mockResolvedValue({ files: [] }) };
    const service = new GoogleSyncService(prisma, google, credentials as any);

    await expect((service as any).syncLink('link-1')).resolves.toMatchObject({ status: 'COMPLETED', changed: 0 });
    expect(credentials.valid).toHaveBeenCalledWith('workspace-1');
    expect(google.listFolderFiles).toHaveBeenCalledWith('fresh-access', 'drive-root', undefined);
  });

  it('uses refreshed credentials for queued Drive writes', async () => {
    const credentials = { valid: jest.fn().mockResolvedValue({ accessToken: 'fresh-access' }) };
    const prisma: any = {
      googleDriveFolderLink: { findUnique: jest.fn().mockResolvedValue({ suspendedAt: null }) },
      googleDriveFolderMapping: { findFirst: jest.fn().mockResolvedValue({ googleDriveFolderLinkId: 'link-1', externalId: 'drive-root' }) },
      integrationSource: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const google: any = {
      createDocument: jest.fn().mockResolvedValue({ documentId: 'new-doc', title: 'Requisito' }),
      findByAppProperty: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'new-doc', name: 'Requisito' }),
      replaceDocument: jest.fn().mockResolvedValue(undefined),
      updateFileName: jest.fn(),
    };
    const service = new GoogleSyncService(prisma, google, credentials as any);

    await (service as any).writeOutbox({
      operation: GoogleDriveOutboxOperation.CREATE,
      requirement: { id: 'requirement-1', projectId: 'project-1', title: 'Requisito', content: { type: 'doc', content: [] }, folderId: 'folder-1', revision: 1, updatedAt: new Date(), archivedAt: null, status: 'ACTIVE' },
      googleDriveFolderLink: { id: 'link-1', connectionId: 'connection-1', projectId: 'project-1', externalId: 'drive-root', connection: { workspaceId: 'workspace-1', status: 'CONNECTED' } },
    });
    await (service as any).writeOutbox({
      operation: GoogleDriveOutboxOperation.CREATE,
      requirement: { id: 'requirement-1', projectId: 'project-1', title: 'Requisito', content: { type: 'doc', content: [] }, folderId: 'folder-1', revision: 1, updatedAt: new Date(), archivedAt: null, status: 'ACTIVE' },
      googleDriveFolderLink: { id: 'link-1', connectionId: 'connection-1', projectId: 'project-1', externalId: 'drive-root', isExportRoot: true, connection: { workspaceId: 'workspace-1', status: 'CONNECTED' } },
    });

    expect(credentials.valid).toHaveBeenCalledWith('workspace-1');
    expect(google.createDocument).toHaveBeenCalledWith('fresh-access', 'Requisito', 'drive-root', { athenaRequirementLinkId: 'link-1:requirement-1' });
    expect(google.createDocument).toHaveBeenCalledTimes(1);
  });

  it('leaves queued Drive writes paused when the project link is suspended', async () => {
    const prisma: any = {
      googleDriveFolderLink: { findUnique: jest.fn().mockResolvedValue({ suspendedAt: new Date() }) },
      googleDriveOutbox: { update: jest.fn().mockResolvedValue({}) },
    };
    const google: any = { createDocument: jest.fn() };
    const service = new GoogleSyncService(prisma, google, { valid: jest.fn() } as any);

    const result = await (service as any).writeOutbox({
      id: 'outbox-1',
      operation: GoogleDriveOutboxOperation.CREATE,
      requirement: { id: 'requirement-1', projectId: 'project-1', title: 'Requisito', content: { type: 'doc', content: [] }, folderId: 'folder-1', revision: 1, updatedAt: new Date(), archivedAt: null, status: 'ACTIVE' },
      googleDriveFolderLink: { id: 'link-1', connectionId: 'connection-1', projectId: 'project-1', externalId: 'drive-root', connection: { workspaceId: 'source-workspace', status: 'CONNECTED' } },
    });

    expect(result).toBeNull();
    expect(google.createDocument).not.toHaveBeenCalled();
    expect(prisma.googleDriveOutbox.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'outbox-1' }, data: expect.objectContaining({ status: 'PENDING' }) }));
  });

  it('queues an immediate Drive write only for a requirement in a linked folder', async () => {
    const prisma: any = {
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', projectId: 'p1', folderId: 'f1', revision: 1, updatedAt: new Date() }) },
      integrationSource: { findFirst: jest.fn().mockResolvedValue(null) },
      googleDriveFolderMapping: { findFirst: jest.fn().mockResolvedValue({ googleDriveFolderLinkId: 'link-1' }) },
      googleDriveFolderLink: { findFirst: jest.fn() },
      googleDriveOutbox: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 0 }), findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new GoogleSyncService(prisma, {} as any, {} as any);
    await service.queueRequirement('r1', GoogleDriveOutboxOperation.CREATE);
    expect(prisma.googleDriveOutbox.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ googleDriveFolderLinkId: 'link-1', requirementId: 'r1', operation: 'CREATE' }) }));
  });

  it('does not queue Drive traffic for an ordinary ATHENA folder', async () => {
    const prisma: any = { requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', projectId: 'p1', folderId: 'f1', revision: 1, updatedAt: new Date() }) }, integrationSource: { findFirst: jest.fn().mockResolvedValue(null) }, googleDriveFolderMapping: { findFirst: jest.fn().mockResolvedValue(null) }, googleDriveFolderLink: { findFirst: jest.fn().mockResolvedValue(null) }, googleDriveOutbox: { create: jest.fn() } };
    const service = new GoogleSyncService(prisma, {} as any, {} as any);
    await service.queueRequirement('r1', GoogleDriveOutboxOperation.CREATE);
    expect(prisma.googleDriveOutbox.create).not.toHaveBeenCalled();
  });

  it('queues a local requirement under the project export root even when its folder has no Drive mapping', async () => {
    const prisma: any = {
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', projectId: 'p1', folderId: 'f1', revision: 1, updatedAt: new Date() }) },
      integrationSource: { findFirst: jest.fn().mockResolvedValue(null) },
      googleDriveFolderMapping: { findFirst: jest.fn().mockResolvedValue(null) },
      googleDriveFolderLink: { findFirst: jest.fn().mockResolvedValue({ id: 'root-link' }) },
      googleDriveOutbox: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 0 }), findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new GoogleSyncService(prisma, {} as any, {} as any);

    await service.queueRequirement('r1', GoogleDriveOutboxOperation.CREATE);

    expect(prisma.googleDriveOutbox.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ googleDriveFolderLinkId: 'root-link', requirementId: 'r1', operation: 'CREATE' }) }));
  });

  it('renames and moves a mapped Drive folder through the outbox operation', async () => {
    const prisma: any = {
      googleDriveFolderLink: { findUnique: jest.fn().mockResolvedValue({ suspendedAt: null }) },
      googleDriveFolderMapping: { findFirst: jest.fn().mockResolvedValue({ externalId: 'remote-folder' }), updateMany: jest.fn() },
    };
    const google: any = { updateFileName: jest.fn(), moveFile: jest.fn() };
    const service = new GoogleSyncService(prisma, google, { valid: jest.fn().mockResolvedValue({ accessToken: 'fresh-access' }) } as any);

    await (service as any).writeOutbox({
      operation: GoogleDriveOutboxOperation.MOVE_FOLDER,
      folder: { id: 'folder-1', name: 'Nova pasta', parentId: null },
      googleDriveFolderLink: { id: 'link-1', projectId: 'project-1', externalId: 'drive-root', isExportRoot: true, connection: { workspaceId: 'workspace-1', status: 'CONNECTED' } },
    });

    expect(google.updateFileName).toHaveBeenCalledWith('fresh-access', 'remote-folder', 'Nova pasta');
    expect(google.moveFile).toHaveBeenCalledWith('fresh-access', 'remote-folder', 'drive-root');
    expect(prisma.googleDriveFolderMapping.updateMany).toHaveBeenCalled();
  });

  it('moves a deleted mapped Drive folder to the trash', async () => {
    const google: any = { trashFile: jest.fn().mockResolvedValue({}) };
    const service = new GoogleSyncService({ googleDriveFolderLink: { findUnique: jest.fn().mockResolvedValue({ suspendedAt: null }) } } as any, google, { valid: jest.fn().mockResolvedValue({ accessToken: 'fresh-access' }) } as any);

    await (service as any).writeOutbox({
      operation: GoogleDriveOutboxOperation.DELETE_FOLDER,
      folder: null,
      payload: { externalId: 'remote-folder' },
      googleDriveFolderLink: { id: 'link-1', connection: { workspaceId: 'workspace-1', status: 'CONNECTED' } },
    });

    expect(google.trashFile).toHaveBeenCalledWith('fresh-access', 'remote-folder');
  });

  it('waits for a pending document move before trashing its former Drive folder', async () => {
    const google: any = { trashFile: jest.fn(), findByAppProperty: jest.fn() };
    const prisma: any = { googleDriveFolderLink: { findUnique: jest.fn().mockResolvedValue({ suspendedAt: null }) }, googleDriveOutbox: { findMany: jest.fn().mockResolvedValueOnce([{ id: 'move-1' }]) } };
    const service = new GoogleSyncService(prisma, google, { valid: jest.fn().mockResolvedValue({ accessToken: 'fresh-access' }) } as any);

    const result = await (service as any).writeOutbox({
      operation: GoogleDriveOutboxOperation.DELETE_FOLDER,
      payload: { deletedFolderId: 'folder-1', externalId: 'remote-folder', requirementIds: ['req-1'] },
      googleDriveFolderLink: { id: 'link-1', connection: { workspaceId: 'workspace-1', status: 'CONNECTED' } },
    });

    expect(result).toBe(false);
    expect(google.trashFile).not.toHaveBeenCalled();
    expect(google.findByAppProperty).not.toHaveBeenCalled();
  });

  it('finds an in-flight Athena folder creation by marker before trashing it', async () => {
    const google: any = {
      findByAppProperty: jest.fn().mockResolvedValue({ id: 'remote-folder' }),
      trashFile: jest.fn().mockResolvedValue({}),
    };
    const prisma: any = { googleDriveFolderLink: { findUnique: jest.fn().mockResolvedValue({ suspendedAt: null }) }, googleDriveOutbox: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new GoogleSyncService(prisma, google, { valid: jest.fn().mockResolvedValue({ accessToken: 'fresh-access' }) } as any);

    await (service as any).writeOutbox({
      operation: GoogleDriveOutboxOperation.DELETE_FOLDER,
      payload: { deletedFolderId: 'folder-1', requirementIds: [] },
      googleDriveFolderLink: { id: 'link-1', connection: { workspaceId: 'workspace-1', status: 'CONNECTED' } },
    });

    expect(google.findByAppProperty).toHaveBeenCalledWith('fresh-access', 'athenaFolderLinkId', 'link-1:folder-1');
    expect(google.trashFile).toHaveBeenCalledWith('fresh-access', 'remote-folder');
  });

  it('promotes legacy Drive subfolders to the overview root', async () => {
    const prisma: any = {
      googleDriveFolderMapping: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mapping-root', folderId: 'folder-root' }),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      requirementFolder: {
        findFirst: jest.fn().mockResolvedValue({ id: 'fallback' }),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      requirement: { updateMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const service = new GoogleSyncService(prisma, {} as any, {} as any);
    await (service as any).flattenLegacyRoot({
      id: 'link-1',
      externalId: 'drive-root',
      projectId: 'project-1', connection: { workspaceId: 'workspace-1' },
    });

    expect(prisma.requirementFolder.updateMany).toHaveBeenCalledWith({
      where: { parentId: 'folder-root' }, data: { parentId: null },
    });
    expect(prisma.googleDriveFolderMapping.updateMany).toHaveBeenCalledWith({
      where: { googleDriveFolderLinkId: 'link-1', parentExternalId: 'drive-root' }, data: { parentExternalId: null },
    });
    expect(prisma.requirement.updateMany).toHaveBeenCalledWith({
      where: { folderId: 'folder-root' }, data: { folderId: 'fallback' },
    });
    expect(prisma.googleDriveFolderMapping.delete).toHaveBeenCalledWith({ where: { id: 'mapping-root' } });
    expect(prisma.requirementFolder.delete).toHaveBeenCalledWith({ where: { id: 'folder-root' } });
  });

  it('keeps direct Drive subfolders at the overview root', async () => {
    const prisma: any = {
      googleDriveFolderMapping: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'mapping-child', folderId: 'folder-child', name: '01-Conta-e-Acesso', parentExternalId: 'drive-root',
          folder: { parentId: 'fallback' },
        }),
        update: jest.fn(),
      },
      requirementFolder: { update: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const service = new GoogleSyncService(prisma, {} as any, {} as any);
    await (service as any).ensureFolder(
      { id: 'link-1', projectId: 'project-1', connection: { workspaceId: 'workspace-1' } },
      'child-drive-folder',
      '01-Conta-e-Acesso',
      'drive-root',
      null,
    );

    expect(prisma.requirementFolder.update).toHaveBeenCalledWith({
      where: { id: 'folder-child' }, data: { name: '01-Conta-e-Acesso', parentId: null },
    });
  });

  it('treats the next Drive read of an outbox write as an acknowledgement, not a loop', async () => {
    const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mesmo conteúdo' }] }] };
    const pushed = createHash('sha256').update(JSON.stringify({ title: 'US sincronizada', content: document })).digest('hex');
    const prisma: any = { integrationSource: { findUnique: jest.fn().mockResolvedValue({ id: 's1', lastPushedFingerprint: pushed, canonicalRequirement: { id: 'r1', projectId: 'p', title: 'US sincronizada', content: document, folderId: 'f1', revision: 1, updatedAt: new Date(), archivedAt: null, status: 'ACTIVE' } }), update: jest.fn().mockResolvedValue({}) } };
    const service = new GoogleSyncService(prisma, {} as any, {} as any);
    await expect((service as any).applyRemote({ id: 'l1', connectionId: 'c1', projectId: 'p', externalId: 'root', name: 'Raiz', connection: { workspaceId: 'w', status: 'CONNECTED' } }, 'run-1', { id: 'file-1', name: 'US sincronizada', mimeType: 'application/vnd.google-apps.document', modifiedTime: new Date().toISOString() }, 'Mesmo conteúdo', document, 'f1')).resolves.toBe(false);
    expect(prisma.integrationSource.update).toHaveBeenCalled();
  });
});
