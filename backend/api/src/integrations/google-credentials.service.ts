import { ConflictException, Injectable } from '@nestjs/common';
import { IntegrationKind } from '@prisma/client';
import { IntegrationsService } from './integrations.service';
import { GoogleAdapter, GoogleApiError, mapGoogleError } from './google.adapter';

@Injectable()
export class GoogleCredentialsService {
  constructor(private readonly integrations: IntegrationsService, private readonly google: GoogleAdapter) {}

  async valid(workspaceId: string): Promise<Record<string, string>> {
    const credentials = await this.integrations.activeCredentials(workspaceId, IntegrationKind.GOOGLE);
    const expiresAt = Number(credentials.expiresAt ?? 0);
    if (expiresAt && expiresAt > Date.now() + 30_000) return credentials;
    if (!credentials.refreshToken) {
      throw new ConflictException('Sessão Google expirada; reconecte a integração.');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) throw new ConflictException('OAuth Google não configurado no ambiente');

    try {
      const token = await this.google.refreshAccessToken(credentials.refreshToken, clientId, clientSecret);
      const refreshed = {
        ...credentials,
        accessToken: token.access_token,
        expiresAt: String(Date.now() + Number(token.expires_in ?? 3600) * 1000),
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
      };
      await this.integrations.replaceCredentials(workspaceId, IntegrationKind.GOOGLE, refreshed);
      return refreshed;
    } catch (error) {
      if (error instanceof GoogleApiError && error.code === 'AUTHENTICATION') {
        throw new ConflictException('Sessão Google expirada ou revogada; reconecte a integração.');
      }
      if (error instanceof GoogleApiError) mapGoogleError(error);
      throw error;
    }
  }
}
