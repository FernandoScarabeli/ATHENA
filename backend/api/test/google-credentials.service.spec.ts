import { ConflictException } from '@nestjs/common';
import { GoogleApiError } from '../src/integrations/google.adapter';
import { GoogleCredentialsService } from '../src/integrations/google-credentials.service';

describe('GoogleCredentialsService', () => {
  const integrations: any = {
    activeCredentials: jest.fn(),
    replaceCredentials: jest.fn().mockResolvedValue(undefined),
  };
  const google: any = { refreshAccessToken: jest.fn() };
  const service = new GoogleCredentialsService(integrations, google);

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    jest.clearAllMocks();
  });

  it('renews and persists an expired access token while keeping its refresh token', async () => {
    integrations.activeCredentials.mockResolvedValue({ accessToken: 'old-access', refreshToken: 'refresh', expiresAt: '1' });
    google.refreshAccessToken.mockResolvedValue({ access_token: 'new-access', expires_in: 3600 });

    const result = await service.valid('workspace-1');

    expect(google.refreshAccessToken).toHaveBeenCalledWith('refresh', 'client', 'secret');
    expect(integrations.replaceCredentials).toHaveBeenCalledWith('workspace-1', 'GOOGLE', expect.objectContaining({ accessToken: 'new-access', refreshToken: 'refresh' }));
    expect(Number(result.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('does not refresh a token that is still valid', async () => {
    const credentials = { accessToken: 'current-access', refreshToken: 'refresh', expiresAt: String(Date.now() + 600_000) };
    integrations.activeCredentials.mockResolvedValue(credentials);

    await expect(service.valid('workspace-1')).resolves.toBe(credentials);
    expect(google.refreshAccessToken).not.toHaveBeenCalled();
    expect(integrations.replaceCredentials).not.toHaveBeenCalled();
  });

  it('asks the user to reconnect when the refresh token is missing or rejected', async () => {
    integrations.activeCredentials.mockResolvedValueOnce({ accessToken: 'old-access', expiresAt: '1' });
    await expect(service.valid('workspace-1')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('reconecte'),
    });

    integrations.activeCredentials.mockResolvedValueOnce({ accessToken: 'old-access', refreshToken: 'refresh', expiresAt: '1' });
    google.refreshAccessToken.mockRejectedValueOnce(new GoogleApiError('AUTHENTICATION', 401, 'invalid_grant'));
    await expect(service.valid('workspace-1')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('reconecte'),
    });
  });
});
