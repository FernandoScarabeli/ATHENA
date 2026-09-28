import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IntegrationCandidateChangeType, IntegrationCandidateStatus, IntegrationKind, WorkspaceRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../core/prisma.service';
import { IntegrationCrypto } from './crypto.service';
import { IntegrationsService } from './integrations.service';
import { GoogleAdapter, GoogleApiError, GOOGLE_SCOPES, GoogleFile, mapGoogleError } from './google.adapter';
import { GoogleCredentialsService } from './google-credentials.service';
import { GoogleSyncService } from './google-sync.service';
import { requireProjectAccess, requireProjectManagerOrOwner, requireWorkspaceManagerOrOwner, requireWorkspaceOwner } from '../common/project-access';

const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  constructor(private readonly prisma: PrismaService, private readonly integrations: IntegrationsService, private readonly crypto: IntegrationCrypto, private readonly google: GoogleAdapter, private readonly googleCredentials: GoogleCredentialsService, private readonly sync?: GoogleSyncService) {}

  private async owner(userId: string, workspaceId: string) {
    try { await requireWorkspaceOwner(this.prisma, userId, workspaceId); }
    catch (error) { if (error instanceof ForbiddenException) throw new ForbiddenException('Somente OWNER pode operar a integração Google'); throw error; }
  }
  private async member(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!membership) throw new ForbiddenException('Você não participa deste workspace');
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { archivedAt: true } });
    if (!workspace || workspace.archivedAt) throw new NotFoundException('Este workspace está arquivado');
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

  async files(userId: string, workspaceId: string, pageToken?: string) {
    await requireWorkspaceManagerOrOwner(this.prisma, userId, workspaceId); const credentials = await this.googleCredentials.valid(workspaceId);
    try { return await this.google.listFiles(credentials.accessToken, pageToken); } catch (error) { if (error instanceof GoogleApiError) mapGoogleError(error); throw error; }
  }

  async folders(userId: string, workspaceId: string, pageToken?: string, query?: string) {
    await requireWorkspaceManagerOrOwner(this.prisma, userId, workspaceId); const credentials = await this.googleCredentials.valid(workspaceId);
    try {
      const result = await this.google.listFolders(credentials.accessToken, pageToken, query);
      return {
        ...result,
        files: result.files.map(({ ownedByMe, sharedWithMeTime, ...folder }) => ({ ...folder, ownership: ownedByMe === true ? 'OWNED' as const : 'SHARED' as const })),
      };
    } catch (error) { if (error instanceof GoogleApiError) mapGoogleError(error); throw error; }
  }

  async folderLinks(userId: string, workspaceId: string) {
    await requireWorkspaceManagerOrOwner(this.prisma, userId, workspaceId);
    const connection = await this.prisma.integrationConnection.findUnique({ where: { workspaceId_kind: { workspaceId, kind: IntegrationKind.GOOGLE } } });
    if (!connection) throw new NotFoundException('Conexão Google não encontrada');
    return this.prisma.googleDriveFolderLink.findMany({ where: { connectionId: connection.id, suspendedAt: null }, orderBy: { name: 'asc' }, include: { project: { select: { id: true, key: true, name: true } }, _count: { select: { sources: true } } } });
  }

  async setExportRoot(userId: string, workspaceId: string, linkId: string) {
    await requireWorkspaceManagerOrOwner(this.prisma, userId, workspaceId);
    const link = await this.prisma.googleDriveFolderLink.findFirst({ where: { id: linkId, suspendedAt: null, connection: { workspaceId } }, select: { id: true, projectId: true } });
    if (!link?.projectId) throw new NotFoundException('Vínculo de pasta não encontrado neste workspace');
    await this.prisma.$transaction(async tx => {
      await tx.googleDriveFolderLink.updateMany({ where: { projectId: link.projectId, isExportRoot: true }, data: { isExportRoot: false } });
      await tx.googleDriveFolderLink.update({ where: { id: link.id }, data: { isExportRoot: true } });
    });
    await this.sync?.queueProjectFolders(link.projectId, link.id);
    await this.sync?.queueProjectRequirements(link.projectId);
    return this.prisma.googleDriveFolderLink.findUnique({ where: { id: link.id }, include: { project: { select: { id: true, key: true, name: true } } } });
  }

  private async projectForMember(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, workspaceId: true, name: true, key: true } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    await requireProjectAccess(this.prisma, userId, projectId);
    return project;
  }

  async exportPreview(userId: string, projectId: string) {
    const project = await this.projectForMember(userId, projectId);
    const root = await this.prisma.googleDriveFolderLink.findFirst({ where: { projectId, isExportRoot: true, suspendedAt: null }, select: { id: true, name: true, externalId: true, syncStatus: true, syncError: true } });
    const count = await this.prisma.requirement.count({ where: { projectId, status: 'ACTIVE', archivedAt: null, integrationSource: null, googleDriveOutbox: { none: { operation: 'CREATE', status: { in: ['PENDING', 'PROCESSING'] } } } } });
    return { project: { id: project.id, key: project.key, name: project.name }, root, eligibleCount: count };
  }

  async exportExisting(userId: string, projectId: string) {
    const project = await this.projectForMember(userId, projectId);
    await requireProjectManagerOrOwner(this.prisma, userId, projectId);
    const root = await this.prisma.googleDriveFolderLink.findFirst({ where: { projectId, isExportRoot: true, suspendedAt: null }, select: { id: true } });
    if (!root) throw new ConflictException('Configure uma pasta raiz do Google Drive para este projeto antes de exportar');
    const requirements = await this.prisma.requirement.findMany({ where: { projectId, status: 'ACTIVE', archivedAt: null, integrationSource: null, googleDriveOutbox: { none: { operation: 'CREATE', status: { in: ['PENDING', 'PROCESSING'] } } } }, select: { id: true } });
    if (!requirements.length) return { enqueued: 0 };
    const rows = requirements.map((requirement: { id: string }) => ({
      googleDriveFolderLinkId: root.id, requirementId: requirement.id, operation: 'CREATE' as const, payload: {},
      idempotencyKey: `google:req:${root.id}:${requirement.id}:CREATE:create`,
    }));
    const inserted = await this.prisma.googleDriveOutbox.createMany({ data: rows, skipDuplicates: true });
    const keys = rows.map(row => row.idempotencyKey);
    const retried = await this.prisma.googleDriveOutbox.updateMany({
      where: { idempotencyKey: { in: keys }, status: { in: ['FAILED', 'COMPLETED'] } },
      data: { status: 'PENDING', attempts: 0, availableAt: new Date(), completedAt: null, error: null },
    });
    setImmediate(() => void this.sync?.processPendingOutbox().catch(error => this.logger.error('google bulk export failed', error instanceof Error ? error.stack : undefined)));
    return { enqueued: inserted.count, retried: retried.count };
  }

  async exportStatus(userId: string, projectId: string) {
    await this.projectForMember(userId, projectId);
    const [root, operations] = await Promise.all([
      this.prisma.googleDriveFolderLink.findFirst({ where: { projectId, isExportRoot: true, suspendedAt: null }, select: { id: true, name: true, externalId: true, syncStatus: true, syncError: true } }),
      this.prisma.googleDriveOutbox.findMany({
        where: { googleDriveFolderLink: { projectId, suspendedAt: null }, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }], take: 30,
        select: { id: true, operation: true, status: true, attempts: true, error: true, updatedAt: true, requirement: { select: { id: true, title: true } }, folder: { select: { id: true, name: true } }, googleDriveFolderLink: { select: { id: true, name: true, isExportRoot: true } } },
      }),
    ]);
    return { root, operations };
  }

  async syncRuns(userId: string, workspaceId: string, cursor?: string, limit = 12) {
    await this.member(userId, workspaceId);
    const take = Math.min(Math.max(limit || 12, 1), 50);
    const rows = await this.prisma.googleDriveSyncRun.findMany({ where: { googleDriveFolderLink: { connection: { workspaceId } }, OR: [{ status: 'FAILED' }, { status: 'COMPLETED', changedCount: { gt: 0 } }] }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { googleDriveFolderLink: { select: { id: true, name: true, project: { select: { id: true, key: true, name: true } } } }, _count: { select: { items: true } } } });
    const hasMore = rows.length > take;
    const items = rows.slice(0, take).map(({ googleDriveFolderLink, _count, ...run }) => ({ ...run, folder: googleDriveFolderLink, itemCount: _count.items }));
    return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async syncRunItems(userId: string, workspaceId: string, runId: string, cursor?: string, limit = 20) {
    await this.member(userId, workspaceId);
    const run = await this.prisma.googleDriveSyncRun.findFirst({ where: { id: runId, googleDriveFolderLink: { connection: { workspaceId } } }, select: { id: true } });
    if (!run) throw new NotFoundException('Sincronização não encontrada');
    const take = Math.min(Math.max(limit || 20, 1), 50);
    const rows = await this.prisma.googleDriveSyncRunItem.findMany({ where: { googleDriveSyncRunId: run.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { candidate: { select: { status: true, content: true, previousContent: true, previousTitle: true, updatedAt: true } } } });
    const hasMore = rows.length > take;
    const items = rows.slice(0, take);
    return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async linkFolder(userId: string, workspaceId: string, externalId: string, name: string, projectId: string) {
    await requireWorkspaceManagerOrOwner(this.prisma, userId, workspaceId); const connection = await this.prisma.integrationConnection.findUnique({ where: { workspaceId_kind: { workspaceId, kind: IntegrationKind.GOOGLE } } });
    if (!connection) throw new NotFoundException('Conexão Google não encontrada');
    if (!externalId?.trim() || !name?.trim()) throw new BadRequestException('Pasta Google inválida');
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException('Projeto não encontrado neste workspace');
    await requireProjectManagerOrOwner(this.prisma, userId, projectId);
    const link = await this.prisma.$transaction(async tx => {
      const current = await tx.googleDriveFolderLink.findUnique({ where: { connectionId_externalId: { connectionId: connection.id, externalId: externalId.trim() } } });
      if (current && current.projectId && current.projectId !== project.id) throw new ConflictException('Esta pasta do Drive já está vinculada a outro projeto deste workspace');
      if (current && !current.projectId) {
        const sources = await tx.integrationSource.findMany({
          where: { googleDriveFolderLinkId: current.id, canonicalRequirementId: { not: null } },
          select: { canonicalRequirement: { select: { projectId: true } } },
        });
        if (sources.some((source: { canonicalRequirement: { projectId: string } | null }) => source.canonicalRequirement && source.canonicalRequirement.projectId !== project.id)) {
          throw new ConflictException('Esta pasta contém US vinculadas a outro projeto; escolha uma pasta compatível com o projeto de destino');
        }
      }
      const rootExists = await tx.googleDriveFolderLink.findFirst({ where: { projectId: project.id, isExportRoot: true, suspendedAt: null }, select: { id: true } });
      if (current) return tx.googleDriveFolderLink.update({ where: { id: current.id }, data: { name: name.trim(), projectId: project.id, ...(!rootExists ? { isExportRoot: true } : {}) } });
      return tx.googleDriveFolderLink.create({ data: { connectionId: connection.id, projectId: project.id, externalId: externalId.trim(), name: name.trim(), isExportRoot: !rootExists } });
    });
    // Linking a folder is an explicit request to import it. Do the initial
    // pass now instead of making the user wait for the ten-minute poll.
    if (this.sync) await this.sync.syncNow(userId, workspaceId, link.id);
    if (link.isExportRoot) {
      await this.sync?.queueProjectFolders(project.id, link.id);
      await this.sync?.queueProjectRequirements(project.id);
    }
    return link;
  }

  async syncFolder(userId: string, workspaceId: string, linkId: string) {
    if (this.sync) return this.sync.syncNow(userId, workspaceId, linkId);
    const link = await this.prisma.googleDriveFolderLink.findFirst({ where: { id: linkId, suspendedAt: null, connection: { workspaceId } } });
    if (!link) throw new NotFoundException('Vínculo de pasta não encontrado');
    if (link.projectId) await requireProjectManagerOrOwner(this.prisma, userId, link.projectId);
    else await this.owner(userId, workspaceId);
    const credentials = await this.googleCredentials.valid(workspaceId);
    const seen: string[] = []; const imported: any[] = []; const failed: any[] = []; let pageToken: string | undefined;
    try { do { const page = await this.google.listFolderFiles(credentials.accessToken, link.externalId, pageToken); for (const file of page.files) { if (file.mimeType === 'application/vnd.google-apps.folder') continue; const externalId = `google:drive:${file.id}`; seen.push(externalId); try { const read = await this.google.readFile(credentials.accessToken, file); const synced = await this.integrations.syncCandidate(userId, workspaceId, IntegrationKind.GOOGLE, { externalId, title: read.title, content: read.content, mimeType: read.mimeType, externalVersion: file.modifiedTime, googleDriveFolderLinkId: link.id }); imported.push({ id: synced.candidate.id, externalId, title: synced.candidate.title, changed: synced.changed }); } catch (error) { if (error instanceof GoogleApiError) failed.push({ externalId, reason: error.code }); else throw error; } } pageToken = page.nextPageToken; } while (pageToken); } catch (error) { if (error instanceof GoogleApiError) mapGoogleError(error); throw error; }
    const removed = await this.prisma.integrationSource.findMany({ where: { googleDriveFolderLinkId: link.id, removedAt: null, externalId: { notIn: seen } }, select: { id: true, externalId: true } });
    if (removed.length) await this.prisma.$transaction([this.prisma.integrationSource.updateMany({ where: { id: { in: removed.map(x => x.id) } }, data: { removedAt: new Date() } }), this.prisma.integrationCandidate.updateMany({ where: { sourceId: { in: removed.map(x => x.id) }, status: IntegrationCandidateStatus.PENDING }, data: { changeType: IntegrationCandidateChangeType.REMOVED, reviewedAt: null } })]);
    return { linkId: link.id, imported, failed, removed: removed.length };
  }

  async importFiles(userId: string, workspaceId: string, fileIds: string[]) {
    await this.owner(userId, workspaceId); const ids = [...new Set(fileIds.map(id => id.trim()).filter(Boolean))]; if (!ids.length) throw new BadRequestException('Selecione ao menos um arquivo Google');
    const credentials = await this.googleCredentials.valid(workspaceId); const connection = await this.prisma.integrationConnection.findUniqueOrThrow({ where: { workspaceId_kind: { workspaceId, kind: IntegrationKind.GOOGLE } } });
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
