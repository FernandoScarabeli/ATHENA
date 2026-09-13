import { GoogleDriveOutboxOperation } from '@prisma/client';
import { createHash } from 'crypto';
import { GoogleSyncService } from '../src/integrations/google-sync.service';

describe('GoogleSyncService', () => {
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

  it('treats the next Drive read of an outbox write as an acknowledgement, not a loop', async () => {
    const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mesmo conteúdo' }] }] };
    const pushed = createHash('sha256').update(JSON.stringify({ title: 'US sincronizada', content: document })).digest('hex');
    const prisma: any = { integrationSource: { findUnique: jest.fn().mockResolvedValue({ id: 's1', lastPushedFingerprint: pushed, canonicalRequirement: { id: 'r1', projectId: 'p', title: 'US sincronizada', content: document, folderId: 'f1', revision: 1, updatedAt: new Date(), archivedAt: null, status: 'ACTIVE' } }), update: jest.fn().mockResolvedValue({}) } };
    const service = new GoogleSyncService(prisma, {} as any, {} as any, {} as any);
    await expect((service as any).applyRemote({ id: 'l1', connectionId: 'c1', projectId: 'p', externalId: 'root', name: 'Raiz', connection: { workspaceId: 'w', status: 'CONNECTED' } }, { id: 'file-1', name: 'US sincronizada', mimeType: 'application/vnd.google-apps.document', modifiedTime: new Date().toISOString() }, 'Mesmo conteúdo', document, 'f1')).resolves.toBe(false);
    expect(prisma.integrationSource.update).toHaveBeenCalled();
  });
});
