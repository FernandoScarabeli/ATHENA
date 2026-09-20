import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { IntegrationKind, IntegrationStatus, WorkspaceRole } from '@prisma/client';
import { IntegrationsService } from '../src/integrations/integrations.service';

describe('IntegrationsService', () => {
  const crypto = { encrypt: jest.fn(() => 'ciphertext'), decrypt: jest.fn(() => JSON.stringify({ token: 'secret' })) } as any;
  function setup(member: any = { role: WorkspaceRole.OWNER }) {
    const prisma: any = {
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(member) },
      integrationConnection: {
        findMany: jest.fn().mockResolvedValue([{ id: 'c', workspaceId: 'w', kind: IntegrationKind.GITHUB, status: IntegrationStatus.CONNECTED, accountLabel: 'acme', encryptedCredentials: 'cipher', connectedAt: null, disconnectedAt: null, createdAt: null, updatedAt: null }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'c', workspaceId: 'w', kind: IntegrationKind.GITHUB, status: IntegrationStatus.CONNECTED, encryptedCredentials: 'cipher' }),
        upsert: jest.fn().mockResolvedValue({ id: 'c', workspaceId: 'w', kind: IntegrationKind.GITHUB, status: IntegrationStatus.CONNECTED, accountLabel: 'acme', encryptedCredentials: 'ciphertext', connectedAt: null, disconnectedAt: null, createdAt: null, updatedAt: null }),
        update: jest.fn().mockResolvedValue({ id: 'c', workspaceId: 'w', kind: IntegrationKind.GITHUB, status: IntegrationStatus.DISCONNECTED, accountLabel: 'acme', encryptedCredentials: null, connectedAt: null, disconnectedAt: new Date(), createdAt: null, updatedAt: null }),
      },
      integrationCandidate: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { service: new IntegrationsService(prisma, crypto), prisma };
  }

  it('returns safe metadata only', async () => {
    const { service } = setup(); const result = await service.list('u', 'w');
    expect(result[0]).not.toHaveProperty('encryptedCredentials');
    expect(result[0]).toMatchObject({ kind: IntegrationKind.GITHUB, accountLabel: 'acme' });
  });

  it('allows only owner to connect/disconnect and validates credentials', async () => {
    const { service } = setup({ role: WorkspaceRole.EDITOR });
    await expect(service.connect('u', 'w', IntegrationKind.GITHUB, { token: 'long-enough' })).rejects.toBeInstanceOf(ForbiddenException);
    const owner = setup();
    await expect(owner.service.connect('u', 'w', IntegrationKind.GITHUB, { token: 'short' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(owner.service.connect('u', 'w', IntegrationKind.GITHUB, { token: 'long-enough' })).resolves.not.toHaveProperty('encryptedCredentials');
  });

  it('clears inaccessible credentials while preserving the logical connection', async () => {
    const { service, prisma } = setup();
    await expect(service.disconnect('u', 'w', IntegrationKind.GITHUB)).resolves.toMatchObject({ status: IntegrationStatus.DISCONNECTED });
    expect(prisma.integrationConnection.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ encryptedCredentials: null, status: IntegrationStatus.DISCONNECTED }) }));
    prisma.integrationConnection.findUnique.mockResolvedValue({ id: 'c', status: IntegrationStatus.DISCONNECTED, encryptedCredentials: null });
    await expect(service.activeCredentials('w', IntegrationKind.GITHUB)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects missing provider secrets before encryption and isolates workspace access', async () => {
    const owner = setup();
    await expect(owner.service.connect('u', 'w', IntegrationKind.GOOGLE, { refreshToken: 'only-refresh' })).rejects.toBeInstanceOf(BadRequestException);
    const outsider = setup(undefined);
    outsider.prisma.workspaceMember.findUnique.mockResolvedValue(null);
    await expect(outsider.service.list('u', 'w')).rejects.toBeInstanceOf(ForbiddenException);
    expect(outsider.prisma.integrationConnection.findMany).not.toHaveBeenCalled();
  });

  it('returns provider metadata with candidates used by the integration activity UI', async () => {
    const { service, prisma } = setup();
    await service.candidates('u', 'w');
    expect(prisma.integrationCandidate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ connection: { select: { kind: true, workspaceId: true } } }),
    }));
  });
});
