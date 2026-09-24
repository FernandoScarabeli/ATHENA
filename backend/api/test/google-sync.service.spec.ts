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
    const service = new GoogleSyncService(prisma, google, {} as any, credentials as any);

    await expect((service as any).syncLink('link-1')).resolves.toMatchObject({ status: 'COMPLETED', changed: 0 });
    expect(credentials.valid).toHaveBeenCalledWith('workspace-1');
    expect(google.listFolderFiles).toHaveBeenCalledWith('fresh-access', 'drive-root', undefined);
  });

  it('uses refreshed credentials for queued Drive writes', async () => {
    const credentials = { valid: jest.fn().mockResolvedValue({ accessToken: 'fresh-access' }) };
    const prisma: any = {
      googleDriveFolderMapping: { findUnique: jest.fn().mockResolvedValue({ googleDriveFolderLinkId: 'link-1', externalId: 'drive-root' }) },
      integrationSource: { create: jest.fn().mockResolvedValue({}) },
    };
    const google: any = {
      createDocument: jest.fn().mockResolvedValue({ documentId: 'new-doc' }),
      moveFile: jest.fn().mockResolvedValue(undefined),
    };
    const service = new GoogleSyncService(prisma, google, {} as any, credentials as any);

    await (service as any).writeOutbox({
      operation: GoogleDriveOutboxOperation.CREATE,
      requirement: { id: 'requirement-1', projectId: 'project-1', title: 'Requisito', content: { type: 'doc', content: [] }, folderId: 'folder-1', revision: 1, updatedAt: new Date(), archivedAt: null, status: 'ACTIVE' },
      googleDriveFolderLink: { id: 'link-1', connectionId: 'connection-1', connection: { workspaceId: 'workspace-1', status: 'CONNECTED' } },
    });

    expect(credentials.valid).toHaveBeenCalledWith('workspace-1');
    expect(google.createDocument).toHaveBeenCalledWith('fresh-access', 'Requisito');
    expect(google.moveFile).toHaveBeenCalledWith('fresh-access', 'new-doc', 'drive-root');
  });

  it('queues an immediate Drive write only for a requirement in a linked folder', async () => {
    const prisma: any = {
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', folderId: 'f1' }) },
      integrationSource: { findFirst: jest.fn().mockResolvedValue(null) },
      googleDriveFolderMapping: { findUnique: jest.fn().mockResolvedValue({ googleDriveFolderLinkId: 'link-1' }) },
      googleDriveOutbox: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new GoogleSyncService(prisma, {} as any, {} as any, {} as any);
    await service.queueRequirement('r1', GoogleDriveOutboxOperation.CREATE);
    expect(prisma.googleDriveOutbox.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ googleDriveFolderLinkId: 'link-1', requirementId: 'r1', operation: 'CREATE' }) }));
  });

  it('does not queue Drive traffic for an ordinary ATHENA folder', async () => {
    const prisma: any = { requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', folderId: 'f1' }) }, integrationSource: { findFirst: jest.fn().mockResolvedValue(null) }, googleDriveFolderMapping: { findUnique: jest.fn().mockResolvedValue(null) }, googleDriveOutbox: { create: jest.fn() } };
    const service = new GoogleSyncService(prisma, {} as any, {} as any, {} as any);
    await service.queueRequirement('r1', GoogleDriveOutboxOperation.CREATE);
    expect(prisma.googleDriveOutbox.create).not.toHaveBeenCalled();
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
    const service = new GoogleSyncService(prisma, {} as any, {} as any, {} as any);
    await (service as any).flattenLegacyRoot({
      id: 'link-1',
      externalId: 'drive-root',
      connection: { workspaceId: 'workspace-1' },
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
    const service = new GoogleSyncService(prisma, {} as any, {} as any, {} as any);
    await (service as any).ensureFolder(
      { id: 'link-1', connection: { workspaceId: 'workspace-1' } },
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
    const service = new GoogleSyncService(prisma, {} as any, {} as any, {} as any);
    await expect((service as any).applyRemote({ id: 'l1', connectionId: 'c1', projectId: 'p', externalId: 'root', name: 'Raiz', connection: { workspaceId: 'w', status: 'CONNECTED' } }, 'run-1', { id: 'file-1', name: 'US sincronizada', mimeType: 'application/vnd.google-apps.document', modifiedTime: new Date().toISOString() }, 'Mesmo conteúdo', document, 'f1')).resolves.toBe(false);
    expect(prisma.integrationSource.update).toHaveBeenCalled();
  });
});
