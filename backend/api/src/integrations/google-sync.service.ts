import { ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { GoogleDriveOutboxOperation, GoogleDriveOutboxStatus, GoogleSyncStatus, IntegrationCandidateChangeType, IntegrationCandidateStatus, IntegrationStatus, Prisma, RequirementStatus, RequirementType, WorkspaceRole } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../core/prisma.service';
import { AiAnalysisJobService } from '../ai/ai-analysis-job.service';
import { GoogleAdapter, GoogleApiError, GoogleFile, GOOGLE_DOC_MIME, READABLE_GOOGLE_MIME_TYPES } from './google.adapter';
import { GoogleCredentialsService } from './google-credentials.service';

const GOOGLE_DOC = GOOGLE_DOC_MIME;
const POLL_MS = 10 * 60 * 1000;

type LinkedFolder = { id: string; connectionId: string; projectId: string | null; externalId: string; name: string; connection: { workspaceId: string; status: IntegrationStatus } };
type CanonicalRequirement = { id: string; projectId: string; title: string; content: unknown; folderId: string; revision: number; updatedAt: Date; archivedAt: Date | null; status: RequirementStatus };

/**
 * Owns both directions of a Drive link. Database state is committed before a
 * Drive write, and Drive writes are fingerprinted so the next poll treats the
 * provider echo as acknowledgement rather than a second edit.
 */
@Injectable()
export class GoogleSyncService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(GoogleSyncService.name);
  private timer?: NodeJS.Timeout;
  private processingOutbox = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleAdapter,
    private readonly aiJobs: AiAnalysisJobService,
    private readonly googleCredentials: GoogleCredentialsService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.poll().catch(error => this.logger.error('google poll failed', error instanceof Error ? error.stack : undefined)), POLL_MS);
    this.timer.unref();
    setImmediate(() => void this.poll().catch(error => this.logger.error('google startup poll failed', error instanceof Error ? error.stack : undefined)));
    setImmediate(() => void this.processOutbox().catch(error => this.logger.error('google outbox recovery failed', error instanceof Error ? error.stack : undefined)));
  }

  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }

  private hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
  private plain(value: unknown) {
    const text: string[] = [];
    const visit = (node: any) => { if (!node || typeof node !== 'object') return; if (typeof node.text === 'string') text.push(node.text); if (Array.isArray(node.content)) node.content.forEach(visit); };
    visit(value); return text.join('').replace(/\n{3,}/g, '\n\n').trim();
  }
  private document(text: string) { return text ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } : { type: 'doc', content: [{ type: 'paragraph' }] }; }
  private requirementFingerprint(requirement: Pick<CanonicalRequirement, 'title' | 'content'>) { return this.hash({ title: requirement.title, content: requirement.content }); }
  private remoteFingerprint(file: GoogleFile, content: string) { return this.hash({ title: file.name, content, externalVersion: file.modifiedTime ?? null }); }

  private async owner(userId: string, workspaceId: string) {
    const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!member || member.role !== WorkspaceRole.OWNER) throw new ForbiddenException('Somente OWNER pode sincronizar o Google Drive');
  }

  async syncNow(userId: string, workspaceId: string, linkId: string) {
    await this.owner(userId, workspaceId);
    const link = await this.prisma.googleDriveFolderLink.findFirst({ where: { id: linkId, connection: { workspaceId } }, select: { id: true } });
    if (!link) throw new NotFoundException('Vínculo de pasta não encontrado');
    return this.syncLink(link.id);
  }

  async poll() {
    await this.processOutbox();
    const links = await this.prisma.googleDriveFolderLink.findMany({ where: { projectId: { not: null }, connection: { status: IntegrationStatus.CONNECTED } }, select: { id: true } });
    await Promise.all(links.map(link => this.syncLink(link.id).catch(error => this.logger.warn(`google sync failed link=${link.id}: ${error instanceof Error ? error.message : 'unknown'}`))));
  }

  private async link(id: string): Promise<LinkedFolder | null> {
    return this.prisma.googleDriveFolderLink.findUnique({ where: { id }, include: { connection: { select: { workspaceId: true, status: true } } } }) as Promise<LinkedFolder | null>;
  }

  private async ensureFolder(link: LinkedFolder, externalId: string, name: string, parentExternalId: string | null, parentId: string | null) {
    const current = await this.prisma.googleDriveFolderMapping.findUnique({ where: { googleDriveFolderLinkId_externalId: { googleDriveFolderLinkId: link.id, externalId } }, include: { folder: true } });
    if (current) {
      if (current.name !== name || current.parentExternalId !== parentExternalId || current.folder.parentId !== parentId) {
        await this.prisma.$transaction([
          this.prisma.requirementFolder.update({ where: { id: current.folderId }, data: { name, parentId } }),
          this.prisma.googleDriveFolderMapping.update({ where: { id: current.id }, data: { name, parentExternalId } }),
        ]);
      }
      return current.folderId;
    }
    const existing = await this.prisma.requirementFolder.findFirst({ where: { workspaceId: link.connection.workspaceId, parentId, name } });
    const folder = existing ?? await this.prisma.requirementFolder.create({ data: { workspaceId: link.connection.workspaceId, parentId, name } });
    await this.prisma.googleDriveFolderMapping.create({ data: { googleDriveFolderLinkId: link.id, externalId, parentExternalId, name, folderId: folder.id } });
    return folder.id;
  }

  private async fallbackFolder(link: LinkedFolder) {
    const current = await this.prisma.requirementFolder.findFirst({
      where: { workspaceId: link.connection.workspaceId, name: 'Sem pasta', parentId: null },
    });
    return current ?? this.prisma.requirementFolder.create({
      data: { workspaceId: link.connection.workspaceId, name: 'Sem pasta', description: 'Requisitos ainda não classificados' },
    });
  }

  /**
   * Before the root folder became a traversal boundary, it was mirrored as an
   * empty ATHENA folder. Promote everything below that old wrapper so existing
   * links gain the same root layout as new imports on their next sync.
   */
  private async flattenLegacyRoot(link: LinkedFolder) {
    const root = await this.prisma.googleDriveFolderMapping.findUnique({
      where: { googleDriveFolderLinkId_externalId: { googleDriveFolderLinkId: link.id, externalId: link.externalId } },
      select: { id: true, folderId: true },
    });
    if (!root) return;
    const fallback = await this.fallbackFolder(link);
    await this.prisma.$transaction([
      this.prisma.requirementFolder.updateMany({ where: { parentId: root.folderId }, data: { parentId: null } }),
      this.prisma.googleDriveFolderMapping.updateMany({ where: { googleDriveFolderLinkId: link.id, parentExternalId: link.externalId }, data: { parentExternalId: null } }),
      this.prisma.requirement.updateMany({ where: { folderId: root.folderId }, data: { folderId: fallback.id } }),
      this.prisma.googleDriveFolderMapping.delete({ where: { id: root.id } }),
      this.prisma.requirementFolder.delete({ where: { id: root.folderId } }),
    ]);
  }

  private async syncLink(id: string) {
    const claimed = await this.prisma.googleDriveFolderLink.updateMany({ where: { id, syncStatus: { not: GoogleSyncStatus.RUNNING } }, data: { syncStatus: GoogleSyncStatus.RUNNING, syncStartedAt: new Date(), syncError: null } });
    if (claimed.count !== 1) return { linkId: id, skipped: true };
    const link = await this.link(id);
    if (!link || !link.projectId || link.connection.status !== IntegrationStatus.CONNECTED) return { linkId: id, skipped: true };
    const run = await this.prisma.googleDriveSyncRun.create({ data: { googleDriveFolderLinkId: id, status: GoogleSyncStatus.RUNNING } });
    let changed = 0;
    let scanned = 0;
    try {
      const credentials = await this.googleCredentials.valid(link.connection.workspaceId);
      await this.flattenLegacyRoot(link);
      const fallback = await this.fallbackFolder(link);
      const seen = new Set<string>();
      const visit = async (driveFolderId: string, athenaParentId: string | null) => {
        let pageToken: string | undefined;
        do {
          const page = await this.google.listFolderFiles(credentials.accessToken, driveFolderId, pageToken);
          for (const file of page.files) {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
              const childFolderId = await this.ensureFolder(link, file.id, file.name, driveFolderId, athenaParentId);
              await visit(file.id, childFolderId);
            } else if (READABLE_GOOGLE_MIME_TYPES.has(file.mimeType)) {
              scanned += 1;
              seen.add(`google:drive:${file.id}`);
              const read = await this.google.readFile(credentials.accessToken, file);
              if (await this.applyRemote(link, run.id, file, read.content, read.document ?? this.document(read.content), athenaParentId ?? fallback.id)) changed += 1;
            }
          }
          pageToken = page.nextPageToken;
        } while (pageToken);
      };
      // The linked folder is a boundary, not an ATHENA folder. Its direct
      // child folders become the top-level folders in the project overview.
      await visit(link.externalId, null);
      changed += await this.archiveMissing(link, seen);
      const completedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.googleDriveFolderLink.update({ where: { id }, data: { syncStatus: GoogleSyncStatus.COMPLETED, syncError: null, lastSyncedAt: completedAt } }),
        this.prisma.googleDriveSyncRun.update({ where: { id: run.id }, data: { status: GoogleSyncStatus.COMPLETED, completedAt, scannedCount: scanned, changedCount: changed } }),
      ]);
      if (changed) void this.aiJobs.start(link.projectId);
      return { linkId: id, runId: run.id, changed, scanned, status: GoogleSyncStatus.COMPLETED };
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'Falha desconhecida').slice(0, 1000);
      const completedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.googleDriveFolderLink.update({ where: { id }, data: { syncStatus: GoogleSyncStatus.FAILED, syncError: message } }),
        this.prisma.googleDriveSyncRun.update({ where: { id: run.id }, data: { status: GoogleSyncStatus.FAILED, error: message, completedAt, scannedCount: scanned, changedCount: changed } }),
      ]);
      if (error instanceof GoogleApiError) throw error;
      throw error;
    }
  }

  private async audit(link: LinkedFolder, externalId: string, sourceId: string, title: string, content: string, fingerprint: string, version?: string) {
    const payload = { provider: 'GOOGLE', content, mimeType: 'text/plain' };
    const candidate = await this.prisma.integrationCandidate.upsert({
      where: { connectionId_externalId: { connectionId: link.connectionId, externalId } },
      create: { connectionId: link.connectionId, sourceId, externalId, title, content: payload, status: IntegrationCandidateStatus.ACCEPTED, externalVersion: version, fingerprint },
      update: { sourceId, title, content: payload, status: IntegrationCandidateStatus.ACCEPTED, externalVersion: version, fingerprint, reviewedAt: new Date() },
    });
    await this.prisma.integrationCandidateRevision.upsert({ where: { candidateId_fingerprint: { candidateId: candidate.id, fingerprint } }, create: { candidateId: candidate.id, externalVersion: version, title, content: payload, fingerprint }, update: {} });
    return candidate;
  }

  private async applyRemote(link: LinkedFolder, runId: string, file: GoogleFile, text: string, document: Record<string, unknown>, folderId: string): Promise<boolean> {
    const externalId = `google:drive:${file.id}`;
    const fingerprint = this.remoteFingerprint(file, text);
    const source = await this.prisma.integrationSource.findUnique({ where: { connectionId_externalId: { connectionId: link.connectionId, externalId } }, include: { canonicalRequirement: true } });
    const remoteAt = file.modifiedTime && !Number.isNaN(Date.parse(file.modifiedTime)) ? new Date(file.modifiedTime) : null;
    // A Drive response has a provider-generated modifiedTime, so compare the
    // canonical document shape as well as the remote fingerprint. This is the
    // acknowledgement path for our own outbox write and prevents a write loop.
    const isOwnEcho = Boolean(source?.canonicalRequirement && source.lastPushedFingerprint === this.hash({ title: file.name, content: document }));
    if (isOwnEcho || source?.lastRemoteFingerprint === fingerprint || source?.lastPushedFingerprint === fingerprint) {
      await this.prisma.integrationSource.update({ where: { id: source!.id }, data: { name: file.name, mimeType: file.mimeType, externalVersion: file.modifiedTime, lastSeenAt: new Date(), removedAt: null, googleDriveFolderLinkId: link.id, lastRemoteFingerprint: fingerprint, lastRemoteModifiedAt: remoteAt } });
      return false;
    }
    if (!source?.canonicalRequirement) {
      const requirement = await this.prisma.$transaction(async tx => {
        const sequence = await tx.project.update({ where: { id: link.projectId! }, data: { requirementSequence: { increment: 1 } }, select: { requirementSequence: true } });
        return tx.requirement.create({ data: { projectId: link.projectId!, code: `US-${String(sequence.requirementSequence).padStart(3, '0')}`, type: RequirementType.USER_STORY, status: RequirementStatus.ACTIVE, title: file.name, content: document as Prisma.InputJsonValue, folderId, source: 'INTEGRATION:GOOGLE' } });
      });
      const linked = await this.prisma.integrationSource.upsert({ where: { connectionId_externalId: { connectionId: link.connectionId, externalId } }, create: { connectionId: link.connectionId, externalId, name: file.name, mimeType: file.mimeType, externalVersion: file.modifiedTime, lastSeenAt: new Date(), googleDriveFolderLinkId: link.id, canonicalRequirementId: requirement.id, lastRemoteFingerprint: fingerprint, lastRemoteModifiedAt: remoteAt }, update: { name: file.name, mimeType: file.mimeType, externalVersion: file.modifiedTime, lastSeenAt: new Date(), removedAt: null, googleDriveFolderLinkId: link.id, canonicalRequirementId: requirement.id, lastRemoteFingerprint: fingerprint, lastRemoteModifiedAt: remoteAt } });
      const candidate = await this.audit(link, externalId, linked.id, file.name, text, fingerprint, file.modifiedTime);
      await this.recordRunItem(runId, candidate.id, linked.id, externalId, file.name, IntegrationCandidateChangeType.CREATED);
      return true;
    }
    const requirement = source.canonicalRequirement as CanonicalRequirement;
    const localChanged = source.lastPushedFingerprint !== this.requirementFingerprint(requirement);
    if (localChanged && remoteAt && remoteAt.getTime() < requirement.updatedAt.getTime()) {
      await this.prisma.integrationSource.update({ where: { id: source.id }, data: { externalVersion: file.modifiedTime, lastSeenAt: new Date(), removedAt: null, lastRemoteFingerprint: fingerprint, lastRemoteModifiedAt: remoteAt, googleDriveFolderLinkId: link.id } });
      await this.enqueue(requirement.id, GoogleDriveOutboxOperation.UPDATE, source.id);
      return false;
    }
    await this.prisma.$transaction(async tx => {
      await tx.requirementVersion.create({ data: { requirementId: requirement.id, revision: requirement.revision, snapshot: { revision: requirement.revision, title: requirement.title, content: requirement.content, folderId: requirement.folderId, status: requirement.status, criteria: [] } as Prisma.InputJsonValue } }).catch(() => undefined);
      await tx.requirement.update({ where: { id: requirement.id }, data: { title: file.name, content: document as Prisma.InputJsonValue, folderId, status: RequirementStatus.ACTIVE, archivedAt: null, revision: { increment: 1 } } });
      await tx.integrationSource.update({ where: { id: source.id }, data: { name: file.name, mimeType: file.mimeType, externalVersion: file.modifiedTime, lastSeenAt: new Date(), removedAt: null, googleDriveFolderLinkId: link.id, lastRemoteFingerprint: fingerprint, lastRemoteModifiedAt: remoteAt } });
    });
    const candidate = await this.audit(link, externalId, source.id, file.name, text, fingerprint, file.modifiedTime);
    await this.recordRunItem(runId, candidate.id, source.id, externalId, file.name, IntegrationCandidateChangeType.UPDATED);
    return true;
  }

  private async recordRunItem(runId: string, candidateId: string, sourceId: string, externalId: string, title: string, changeType: IntegrationCandidateChangeType) {
    await this.prisma.googleDriveSyncRunItem.upsert({
      where: { googleDriveSyncRunId_externalId: { googleDriveSyncRunId: runId, externalId } },
      create: { googleDriveSyncRunId: runId, candidateId, sourceId, externalId, title, changeType },
      update: { candidateId, sourceId, title, changeType },
    });
  }

  private async archiveMissing(link: LinkedFolder, seen: Set<string>) {
    const sources = await this.prisma.integrationSource.findMany({ where: { googleDriveFolderLinkId: link.id, removedAt: null, externalId: { notIn: [...seen] }, canonicalRequirementId: { not: null } }, include: { canonicalRequirement: true } });
    for (const source of sources) await this.prisma.$transaction(async tx => {
      await tx.integrationSource.update({ where: { id: source.id }, data: { removedAt: new Date() } });
      if (source.canonicalRequirement && !source.canonicalRequirement.archivedAt) {
        await tx.requirement.update({ where: { id: source.canonicalRequirement.id }, data: { status: RequirementStatus.ARCHIVED, archivedAt: new Date() } });
        await tx.requirementRelation.deleteMany({ where: { OR: [{ sourceId: source.canonicalRequirement.id }, { targetId: source.canonicalRequirement.id }] } });
      }
    });
    return sources.length;
  }

  async queueRequirement(requirementId: string, operation: GoogleDriveOutboxOperation) {
    const requirement = await this.prisma.requirement.findUnique({ where: { id: requirementId }, select: { id: true, folderId: true } });
    if (!requirement) return;
    const source = await this.prisma.integrationSource.findFirst({ where: { canonicalRequirementId: requirementId, googleDriveFolderLinkId: { not: null } } });
    const mapping = source ? null : await this.prisma.googleDriveFolderMapping.findUnique({ where: { folderId: requirement.folderId } });
    const linkId = source?.googleDriveFolderLinkId ?? mapping?.googleDriveFolderLinkId;
    if (!linkId) return;
    await this.enqueue(requirementId, operation, source?.id, linkId);
    setImmediate(() => void this.processOutbox().catch(error => this.logger.error('google outbox write failed', error instanceof Error ? error.stack : undefined)));
  }

  private async enqueue(requirementId: string, operation: GoogleDriveOutboxOperation, integrationSourceId?: string, forcedLinkId?: string) {
    const linkId = forcedLinkId ?? (await this.prisma.integrationSource.findUnique({ where: { id: integrationSourceId! }, select: { googleDriveFolderLinkId: true } }))?.googleDriveFolderLinkId;
    if (!linkId) return;
    await this.prisma.googleDriveOutbox.create({ data: { googleDriveFolderLinkId: linkId, integrationSourceId: integrationSourceId ?? null, requirementId, operation, payload: {} } });
  }

  private async processOutbox() {
    if (this.processingOutbox) return;
    this.processingOutbox = true;
    try {
      for (;;) {
        const row = await this.prisma.googleDriveOutbox.findFirst({ where: { status: GoogleDriveOutboxStatus.PENDING, availableAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, include: { googleDriveFolderLink: { include: { connection: true } }, integrationSource: true, requirement: { include: { folder: true } } } });
        if (!row) return;
        const claim = await this.prisma.googleDriveOutbox.updateMany({ where: { id: row.id, status: GoogleDriveOutboxStatus.PENDING }, data: { status: GoogleDriveOutboxStatus.PROCESSING, attempts: { increment: 1 }, error: null } });
        if (claim.count !== 1) continue;
        try {
          await this.writeOutbox(row);
          await this.prisma.googleDriveOutbox.update({ where: { id: row.id }, data: { status: GoogleDriveOutboxStatus.COMPLETED, completedAt: new Date(), error: null } });
        } catch (error) {
          const attempts = row.attempts + 1;
          await this.prisma.googleDriveOutbox.update({ where: { id: row.id }, data: { status: attempts >= 5 ? GoogleDriveOutboxStatus.FAILED : GoogleDriveOutboxStatus.PENDING, availableAt: new Date(Date.now() + Math.min(600_000, 1000 * 2 ** attempts)), error: (error instanceof Error ? error.message : 'Falha desconhecida').slice(0, 1000) } });
        }
      }
    } finally { this.processingOutbox = false; }
  }

  private async destinationId(linkId: string, folderId: string) {
    const mapping = await this.prisma.googleDriveFolderMapping.findUnique({ where: { folderId } });
    if (mapping?.googleDriveFolderLinkId === linkId) return mapping.externalId;
    const folder = await this.prisma.requirementFolder.findUnique({ where: { id: folderId }, select: { name: true, parentId: true } });
    if (folder?.name === 'Sem pasta' && !folder.parentId) {
      const link = await this.prisma.googleDriveFolderLink.findUnique({ where: { id: linkId }, select: { externalId: true } });
      if (link) return link.externalId;
    }
    throw new NotFoundException('A pasta ATHENA não pertence a este vínculo do Drive');
  }

  private async archiveFolder(accessToken: string, link: { externalId: string }, credentials: string) {
    const listed = await this.google.listFolderFiles(credentials, link.externalId);
    const current = listed.files.find(file => file.mimeType === 'application/vnd.google-apps.folder' && file.name === 'Arquivados');
    return current?.id ?? (await this.google.createFolder(accessToken, 'Arquivados', link.externalId)).id;
  }

  private async writeOutbox(row: any) {
    const { requirement, googleDriveFolderLink: link } = row;
    if (link.connection.status !== IntegrationStatus.CONNECTED) throw new NotFoundException('Conexão Google não está ativa');
    const credentials = await this.googleCredentials.valid(link.connection.workspaceId);
    const text = this.plain(requirement.content);
    const fingerprint = this.requirementFingerprint(requirement);
    let source = row.integrationSource;
    if (row.operation === GoogleDriveOutboxOperation.CREATE && !source) {
      const document = await this.google.createDocument(credentials.accessToken, requirement.title);
      const destination = await this.destinationId(link.id, requirement.folderId);
      await this.google.moveFile(credentials.accessToken, document.documentId, destination);
      if (text) await this.google.replaceDocument(credentials.accessToken, document.documentId, requirement.content);
      source = await this.prisma.integrationSource.create({ data: { connectionId: link.connectionId, externalId: `google:drive:${document.documentId}`, name: requirement.title, mimeType: GOOGLE_DOC, googleDriveFolderLinkId: link.id, canonicalRequirementId: requirement.id, lastPushedFingerprint: fingerprint, lastRemoteFingerprint: fingerprint } });
      return;
    }
    if (!source) return;
    const fileId = source.externalId.replace(/^google:drive:/, '');
    if (row.operation === GoogleDriveOutboxOperation.ARCHIVE || requirement.archivedAt) {
      const destination = await this.archiveFolder(credentials.accessToken, link, credentials.accessToken);
      await this.google.moveFile(credentials.accessToken, fileId, destination);
    } else {
      if (row.operation === GoogleDriveOutboxOperation.MOVE) await this.google.moveFile(credentials.accessToken, fileId, await this.destinationId(link.id, requirement.folderId));
      await this.google.updateFileName(credentials.accessToken, fileId, requirement.title);
      if (source.mimeType === GOOGLE_DOC) await this.google.replaceDocument(credentials.accessToken, fileId, requirement.content);
      else await this.google.updateTextFile(credentials.accessToken, fileId, text);
    }
    await this.prisma.integrationSource.update({ where: { id: source.id }, data: { name: requirement.title, lastPushedFingerprint: fingerprint } });
  }
}
