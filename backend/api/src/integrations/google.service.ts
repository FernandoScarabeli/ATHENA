import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IntegrationCandidateChangeType, IntegrationCandidateStatus, IntegrationKind, WorkspaceRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../core/prisma.service';
import { IntegrationCrypto } from './crypto.service';
import { IntegrationsService } from './integrations.service';
import { GoogleAdapter, GoogleApiError, GOOGLE_SCOPES, GoogleFile, mapGoogleError } from './google.adapter';
import { GoogleSyncService } from './google-sync.service';

const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  constructor(private readonly prisma: PrismaService, private readonly integrations: IntegrationsService, private readonly crypto: IntegrationCrypto, private readonly google: GoogleAdapter, private readonly sync?: GoogleSyncService) {}

  private async owner(userId: string, workspaceId: string) {
    const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!member || member.role !== WorkspaceRole.OWNER) throw new ForbiddenException('Somente OWNER pode operar a integração Google');
  }
  private config() {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim(); const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim(); const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
    if (!clientId || !clientSecret || !redirectUri) throw new ConflictException('OAuth Google não configurado no ambiente');
    return { clientId, clientSecret, redirectUri };
  }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

  async start(userId: string, workspaceId: string) {
    await this.owner(userId, workspaceId); const config = this.config(); const state = randomBytes(32).toString('base64url');
    await this.prisma.googleOAuthState.create({ data: { stateHash: this.hash(state), workspaceId, userId, redirectUri: config.redirectUri, scopes: GOOGLE_SCOPES.join(' '), expiresAt: new Date(Date.now() + STATE_TTL_MS) } });
    return { authorizationUrl: this.google.authorizationUrl(state, config.redirectUri, config.clientId), expiresInSeconds: STATE_TTL_MS / 1000 };
  }

  async callback(state: string, code: string) {
    if (!state || !code) throw new BadRequestException('Parâmetros OAuth ausentes');
    const now = new Date(); const stateHash = this.hash(state);
    const row = await this.prisma.googleOAuthState.findFirst({ where: { stateHash, usedAt: null, expiresAt: { gt: now } } });
    if (!row) throw new BadRequestException('OAuth state inválido, expirado ou já utilizado');
    const claimed = await this.prisma.googleOAuthState.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (claimed.count !== 1) throw new BadRequestException('OAuth state inválido, expirado ou já utilizado');
    const config = this.config();
    try {
      const token = await this.google.exchangeCode(code, row.redirectUri, config.clientId, config.clientSecret);
      const credentials: Record<string, string> = { accessToken: token.access_token };
      if (token.refresh_token) credentials.refreshToken = token.refresh_token;
      if (token.expires_in) credentials.expiresAt = String(Date.now() + token.expires_in * 1000);
      if (token.token_type) credentials.tokenType = token.token_type;
      return await this.integrations.connect(row.userId, row.workspaceId, IntegrationKind.GOOGLE, credentials, 'Google Drive');
    } catch (error) { if (error instanceof GoogleApiError) mapGoogleError(error); throw error; }
  }

  private async credentials(workspaceId: string) {
    const credentials = await this.integrations.activeCredentials(workspaceId, IntegrationKind.GOOGLE);
    const expiresAt = Number(credentials.expiresAt ?? 0);
    if (expiresAt && expiresAt > Date.now() + 30_000) return credentials;
    if (!credentials.refreshToken) throw new ConflictException('Sessão Google expirada; reconecte a integração');
    const config = this.config();
    try {
      const token = await this.google.refreshAccessToken(credentials.refreshToken, config.clientId, config.clientSecret);
      const refreshed = { ...credentials, accessToken: token.access_token, expiresAt: String(Date.now() + Number(token.expires_in ?? 3600) * 1000) };
      await this.integrations.replaceCredentials(workspaceId, IntegrationKind.GOOGLE, refreshed); return refreshed;
    } catch (error) { if (error instanceof GoogleApiError) mapGoogleError(error); throw error; }
  }

  async files(userId: string, workspaceId: string, pageToken?: string) {
    await this.owner(userId, workspaceId); const credentials = await this.credentials(workspaceId);
    try { return await this.google.listFiles(credentials.accessToken, pageToken); } catch (error) { if (error instanceof GoogleApiError) mapGoogleError(error); throw error; }
  }

  async folders(userId: string, workspaceId: string, pageToken?: string, query?: string) {
    await this.owner(userId, workspaceId); const credentials = await this.credentials(workspaceId);
    try { return await this.google.listFolders(credentials.accessToken, pageToken, query); } catch (error) { if (error instanceof GoogleApiError) mapGoogleError(error); throw error; }
  }

  async folderLinks(userId: string, workspaceId: string) {
    await this.owner(userId, workspaceId);
    const connection = await this.prisma.integrationConnection.findUnique({ where: { workspaceId_kind: { workspaceId, kind: IntegrationKind.GOOGLE } } });
    if (!connection) throw new NotFoundException('Conexão Google não encontrada');
    return this.prisma.googleDriveFolderLink.findMany({ where: { connectionId: connection.id }, orderBy: { name: 'asc' }, include: { _count: { select: { sources: true } } } });
  }

  async linkFolder(userId: string, workspaceId: string, externalId: string, name: string, projectId: string) {
    await this.owner(userId, workspaceId); const connection = await this.prisma.integrationConnection.findUnique({ where: { workspaceId_kind: { workspaceId, kind: IntegrationKind.GOOGLE } } });
    if (!connection) throw new NotFoundException('Conexão Google não encontrada');
    if (!externalId?.trim() || !name?.trim()) throw new BadRequestException('Pasta Google inválida');
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException('Projeto não encontrado neste workspace');
    const link = await this.prisma.googleDriveFolderLink.upsert({ where: { connectionId_externalId: { connectionId: connection.id, externalId: externalId.trim() } }, create: { connectionId: connection.id, projectId: project.id, externalId: externalId.trim(), name: name.trim() }, update: { name: name.trim(), projectId: project.id } });
    // Linking a folder is an explicit request to import it. Do the initial
    // pass now instead of making the user wait for the ten-minute poll.
    if (this.sync) await this.sync.syncNow(userId, workspaceId, link.id);
    return link;
  }

  async syncFolder(userId: string, workspaceId: string, linkId: string) {
    if (this.sync) return this.sync.syncNow(userId, workspaceId, linkId);
    await this.owner(userId, workspaceId); const link = await this.prisma.googleDriveFolderLink.findFirst({ where: { id: linkId, connection: { workspaceId } } });
    if (!link) throw new NotFoundException('Vínculo de pasta não encontrado'); const credentials = await this.credentials(workspaceId);
    const seen: string[] = []; const imported: any[] = []; const failed: any[] = []; let pageToken: string | undefined;
    try { do { const page = await this.google.listFolderFiles(credentials.accessToken, link.externalId, pageToken); for (const file of page.files) { if (file.mimeType === 'application/vnd.google-apps.folder') continue; const externalId = `google:drive:${file.id}`; seen.push(externalId); try { const read = await this.google.readFile(credentials.accessToken, file); const synced = await this.integrations.syncCandidate(userId, workspaceId, IntegrationKind.GOOGLE, { externalId, title: read.title, content: read.content, mimeType: read.mimeType, externalVersion: file.modifiedTime, googleDriveFolderLinkId: link.id }); imported.push({ id: synced.candidate.id, externalId, title: synced.candidate.title, changed: synced.changed }); } catch (error) { if (error instanceof GoogleApiError) failed.push({ externalId, reason: error.code }); else throw error; } } pageToken = page.nextPageToken; } while (pageToken); } catch (error) { if (error instanceof GoogleApiError) mapGoogleError(error); throw error; }
    const removed = await this.prisma.integrationSource.findMany({ where: { googleDriveFolderLinkId: link.id, removedAt: null, externalId: { notIn: seen } }, select: { id: true, externalId: true } });
    if (removed.length) await this.prisma.$transaction([this.prisma.integrationSource.updateMany({ where: { id: { in: removed.map(x => x.id) } }, data: { removedAt: new Date() } }), this.prisma.integrationCandidate.updateMany({ where: { sourceId: { in: removed.map(x => x.id) }, status: IntegrationCandidateStatus.PENDING }, data: { changeType: IntegrationCandidateChangeType.REMOVED, reviewedAt: null } })]);
    return { linkId: link.id, imported, failed, removed: removed.length };
  }

  async importFiles(userId: string, workspaceId: string, fileIds: string[]) {
    await this.owner(userId, workspaceId); const ids = [...new Set(fileIds.map(id => id.trim()).filter(Boolean))]; if (!ids.length) throw new BadRequestException('Selecione ao menos um arquivo Google');
    const credentials = await this.credentials(workspaceId); const connection = await this.prisma.integrationConnection.findUniqueOrThrow({ where: { workspaceId_kind: { workspaceId, kind: IntegrationKind.GOOGLE } } });
    const result: any[] = []; const failed: Array<{ externalId: string; reason: string }> = [];
    for (const fileId of ids) {
      const externalId = `google:drive:${fileId}`;
      try {
        const listed = await this.google.listFiles(credentials.accessToken); const file = listed.files.find((candidate: GoogleFile) => candidate.id === fileId);
        if (!file) { failed.push({ externalId, reason: 'FILE_NOT_FOUND_OR_NOT_AUTHORIZED' }); continue; }
        const read = await this.google.readFile(credentials.accessToken, file);
        const synced = typeof this.integrations.syncCandidate === 'function'
          ? await this.integrations.syncCandidate(userId, workspaceId, IntegrationKind.GOOGLE, { externalId, title: read.title, content: read.content, mimeType: read.mimeType, externalVersion: file.modifiedTime })
          : { candidate: await this.legacyCandidate(connection, externalId, file, read), changed: true };
        result.push({ id: synced.candidate.id, externalId, title: synced.candidate.title, status: synced.candidate.status, sourceId: synced.candidate.sourceId, changed: synced.changed });
      } catch (error) {
        if (error instanceof GoogleApiError) {
          if (error.code === 'RATE_LIMIT') { this.logger.warn(`integration.google.rate_limit workspace=${workspaceId}`); return mapGoogleError(error); }
          failed.push({ externalId, reason: error.code === 'UNSUPPORTED_FILE' ? 'UNSUPPORTED_FILE' : error.code === 'PERMISSION_REVOKED' ? 'PERMISSION_REVOKED' : error.code === 'AUTHENTICATION' ? 'REFRESH_TOKEN_EXPIRED' : 'GOOGLE_READ_FAILED' }); continue;
        }
        throw error;
      }
    }
    return { imported: result, failed };
  }

  private async legacyCandidate(connection: any, externalId: string, file: GoogleFile, read: { title: string; content: string; mimeType: string }) {
    const source = await this.prisma.integrationSource.upsert({ where: { connectionId_externalId: { connectionId: connection.id, externalId } }, create: { connectionId: connection.id, externalId, name: file.name, mimeType: read.mimeType }, update: { name: file.name, mimeType: read.mimeType, capturedAt: new Date() } });
    return this.prisma.integrationCandidate.upsert({ where: { connectionId_externalId: { connectionId: connection.id, externalId } }, create: { connectionId: connection.id, sourceId: source.id, externalId, title: read.title, status: 'PENDING', content: { provider: 'GOOGLE', fileId: file.id, mimeType: read.mimeType, content: read.content, webViewLink: file.webViewLink ?? null } }, update: { sourceId: source.id, title: read.title, content: { provider: 'GOOGLE', fileId: file.id, mimeType: read.mimeType, content: read.content, webViewLink: file.webViewLink ?? null } } });
  }
}
