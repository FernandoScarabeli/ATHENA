import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GoogleService } from '../src/integrations/google.service';

describe('GoogleService', () => {
  const crypto: any = { encrypt: jest.fn(() => 'cipher'), decrypt: jest.fn() };
  const integrations: any = { connect: jest.fn().mockResolvedValue({ id: 'connection', kind: 'GOOGLE' }), activeCredentials: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresAt: String(Date.now() + 3600000) }), replaceCredentials: jest.fn() };
  const google: any = { authorizationUrl: jest.fn(() => 'https://accounts.google.test/auth?state=opaque'), exchangeCode: jest.fn().mockResolvedValue({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }), listFiles: jest.fn().mockResolvedValue({ files: [{ id: 'doc-1', name: 'Doc', mimeType: 'application/vnd.google-apps.document' }] }), readFile: jest.fn().mockResolvedValue({ title: 'Doc', content: 'content', mimeType: 'application/vnd.google-apps.document' }) };
  function setup(member: any = { role: 'OWNER' }) {
    const prisma: any = { workspaceMember: { findUnique: jest.fn().mockResolvedValue(member) }, googleOAuthState: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, integrationConnection: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'connection' }) }, integrationSource: { upsert: jest.fn().mockResolvedValue({ id: 'source' }) }, integrationCandidate: { upsert: jest.fn().mockResolvedValue({ id: 'candidate', title: 'Doc', status: 'PENDING' }) } };
    return { service: new GoogleService(prisma, integrations, crypto, google), prisma };
  }
  beforeEach(() => { process.env.GOOGLE_CLIENT_ID = 'client'; process.env.GOOGLE_CLIENT_SECRET = 'secret'; process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost/callback'; jest.clearAllMocks(); });
  it('requires OWNER and stores a one-use state hash with TTL', async () => {
    const denied = setup({ role: 'EDITOR' }); await expect(denied.service.start('u', 'w')).rejects.toBeInstanceOf(ForbiddenException);
    const { service, prisma } = setup(); const result = await service.start('u', 'w'); expect(result.authorizationUrl).toContain('google.test'); expect(prisma.googleOAuthState.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'w', userId: 'u', stateHash: expect.any(String), expiresAt: expect.any(Date) }) }));
  });
  it('claims state once before exchanging code and never returns tokens', async () => {
    const { service, prisma } = setup(); prisma.googleOAuthState.findFirst.mockResolvedValue({ id: 's', userId: 'u', workspaceId: 'w', redirectUri: 'http://localhost/callback' });
    const result = await service.callback('opaque', 'code'); expect(prisma.googleOAuthState.updateMany).toHaveBeenCalled(); expect(integrations.connect).toHaveBeenCalledWith('u', 'w', 'GOOGLE', expect.objectContaining({ accessToken: 'access', refreshToken: 'refresh' }), 'Google Drive'); expect(result).not.toHaveProperty('accessToken');
    prisma.googleOAuthState.findFirst.mockResolvedValue(null); await expect(service.callback('opaque', 'code')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('imports explicitly selected files as pending candidates', async () => { const { service } = setup(); await expect(service.importFiles('u', 'w', ['doc-1'])).resolves.toMatchObject({ imported: [{ externalId: 'google:drive:doc-1' }], failed: [] }); });
  it('separates folders owned by the connected account from shared folders', async () => {
    const { service } = setup();
    google.listFolders = jest.fn().mockResolvedValue({ files: [
      { id: 'mine', name: 'Minha pasta', mimeType: 'application/vnd.google-apps.folder', ownedByMe: true },
      { id: 'shared', name: 'Pasta compartilhada', mimeType: 'application/vnd.google-apps.folder', ownedByMe: false, sharedWithMeTime: '2026-09-20T00:00:00.000Z' },
      { id: 'shared-drive', name: 'Drive compartilhado', mimeType: 'application/vnd.google-apps.folder' },
    ] });
    await expect(service.folders('u', 'w')).resolves.toMatchObject({ files: [
      { id: 'mine', ownership: 'OWNED' },
      { id: 'shared', ownership: 'SHARED' },
      { id: 'shared-drive', ownership: 'SHARED' },
    ] });
    expect(google.listFolders).toHaveBeenCalledWith('access', undefined, undefined);
  });
  it('does not import with a missing refreshable secret and keeps provider errors classified', async () => {
    const { service } = setup();
    integrations.activeCredentials.mockResolvedValueOnce({ accessToken: 'access', expiresAt: String(Date.now() - 1) });
    await expect(service.files('u', 'w')).rejects.toMatchObject({ status: 409 });
    google.listFiles.mockRejectedValueOnce({ code: 'RATE_LIMIT' });
    integrations.activeCredentials.mockResolvedValueOnce({ accessToken: 'access', refreshToken: 'refresh', expiresAt: String(Date.now() + 3600000) });
    await expect(service.files('u', 'w')).rejects.toBeDefined();
  });
});
