import { PrismaService } from '../src/core/prisma.service';
import { IntegrationCrypto } from '../src/integrations/crypto.service';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { ForbiddenException } from '@nestjs/common';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeDatabase = Boolean(testDatabaseUrl && /(?:^|\/)(athena_test|athena_test_[^/?]+)(?:\?|$)/.test(testDatabaseUrl));
const describeIntegration = safeDatabase ? describe : describe.skip;
if (testDatabaseUrl && !safeDatabase) throw new Error('TEST_DATABASE_URL deve apontar explicitamente para um banco athena_test ou athena_test_*');
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

describeIntegration('ATH-017 secure integrations PostgreSQL', () => {
  let prisma: PrismaService;
  let service: IntegrationsService;
  let workspaceId: string;
  let userIds: string[] = [];
  const oldKey = process.env.INTEGRATION_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
    prisma = new PrismaService(); await prisma.$connect();
    service = new IntegrationsService(prisma, new IntegrationCrypto());
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const users = await Promise.all(['owner', 'viewer', 'outsider'].map(name => prisma.user.create({ data: { email: `integration-${name}-${suffix}@example.test`, name, passwordHash: 'integration-only' } })));
    userIds = users.map(user => user.id);
    const workspace = await prisma.workspace.create({ data: { name: `Integration ${suffix}`, members: { create: [{ userId: userIds[0], role: 'OWNER' }, { userId: userIds[1], role: 'VIEWER' }] } } });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    if (oldKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY; else process.env.INTEGRATION_ENCRYPTION_KEY = oldKey;
  });

  it('isolates by workspace role, hides secret, and preserves source/candidate history on disconnect', async () => {
    await expect(service.connect(userIds[1], workspaceId, 'GITHUB', { token: 'viewer-cannot' })).rejects.toBeInstanceOf(ForbiddenException);
    const connected = await service.connect(userIds[0], workspaceId, 'GITHUB', { token: 'pat-for-test-123' }, 'Conta teste');
    expect(connected).not.toHaveProperty('encryptedCredentials');
    const connection = await prisma.integrationConnection.findUniqueOrThrow({ where: { workspaceId_kind: { workspaceId, kind: 'GITHUB' } } });
    const source = await prisma.integrationSource.create({ data: { connectionId: connection.id, externalId: 'source-1', name: 'Documento histórico' } });
    await prisma.integrationCandidate.create({ data: { connectionId: connection.id, sourceId: source.id, externalId: 'candidate-1', title: 'Candidato', content: { type: 'doc' } } });
    await expect(service.list(userIds[1], workspaceId)).resolves.toEqual([expect.objectContaining({ kind: 'GITHUB', status: 'CONNECTED' })]);
    await service.disconnect(userIds[0], workspaceId, 'GITHUB');
    await expect(prisma.integrationConnection.findUnique({ where: { id: connection.id }, select: { encryptedCredentials: true, status: true } })).resolves.toEqual({ encryptedCredentials: null, status: 'DISCONNECTED' });
    await expect(prisma.integrationSource.findUnique({ where: { id: source.id } })).resolves.toBeTruthy();
    await expect(prisma.integrationCandidate.findUnique({ where: { connectionId_externalId: { connectionId: connection.id, externalId: 'candidate-1' } } })).resolves.toBeTruthy();
  });

  it('syncs idempotently, records external revisions, and approves with optimistic review', async () => {
    const connected = await service.connect(userIds[0], workspaceId, 'GOOGLE', { accessToken: 'google-token-123' }, 'Docs');
    const first = await service.syncCandidate(userIds[0], workspaceId, 'GOOGLE', { externalId: 'google:drive:doc-1', title: 'Documento', content: 'versão um', externalVersion: 'v1', mimeType: 'text/plain' });
    expect(first.changed).toBe(true);
    const repeated = await service.syncCandidate(userIds[0], workspaceId, 'GOOGLE', { externalId: 'google:drive:doc-1', title: 'Documento', content: 'versão um', externalVersion: 'v1', mimeType: 'text/plain' });
    expect(repeated.changed).toBe(false);
    const changed = await service.syncCandidate(userIds[0], workspaceId, 'GOOGLE', { externalId: 'google:drive:doc-1', title: 'Documento renomeado', content: 'versão dois', externalVersion: 'v2', mimeType: 'text/plain' });
    expect(changed.changed).toBe(true);
    expect(await prisma.integrationCandidateRevision.count({ where: { candidateId: changed.candidate.id } })).toBe(2);
    const missing = await service.markSourcesMissing(userIds[0], workspaceId, 'GOOGLE', []);
    expect(missing.removed).toBe(1);
    const removed = await prisma.integrationSource.findUniqueOrThrow({ where: { id: changed.candidate.sourceId! } });
    expect(removed.removedAt).toBeTruthy();
    // A source can reappear: the same stable identity is restored and the
    // audit trail remains attached to the candidate.
    const restored = await service.syncCandidate(userIds[0], workspaceId, 'GOOGLE', { externalId: 'google:drive:doc-1', title: 'Documento renomeado', content: 'versão dois', externalVersion: 'v2', mimeType: 'text/plain' });
    expect(restored.changed).toBe(true);
    const project = await prisma.project.create({ data: { workspaceId, name: 'Importados', key: `IMP${Date.now()}` } });
    const folder = await prisma.requirementFolder.create({ data: { workspaceId, name: `Importados ${Date.now()}` } });
    const accepted = await service.approveCandidate(userIds[0], changed.candidate.id, { projectId: project.id, folderId: folder.id, expectedUpdatedAt: restored.candidate.updatedAt.toISOString() });
    expect(accepted).toMatchObject({ title: 'Documento renomeado', source: 'INTEGRATION:GOOGLE' });
    expect(accepted.content).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'versão dois' }] }] });
    expect((await prisma.integrationCandidate.findUniqueOrThrow({ where: { id: changed.candidate.id } })).status).toBe('ACCEPTED');
    expect(connected).toHaveProperty('kind', 'GOOGLE');
  });
});
