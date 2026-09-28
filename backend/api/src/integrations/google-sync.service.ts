import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { GoogleDriveOutboxOperation, GoogleDriveOutboxStatus, GoogleSyncStatus, IntegrationCandidateChangeType, IntegrationCandidateStatus, IntegrationStatus, Prisma, RequirementStatus, RequirementType, WorkspaceRole } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../core/prisma.service';
import { GoogleAdapter, GoogleFile, GOOGLE_DOC_MIME, READABLE_GOOGLE_MIME_TYPES } from './google.adapter';
import { GoogleCredentialsService } from './google-credentials.service';
import { requireProjectManagerOrOwner, requireWorkspaceOwner } from '../common/project-access';

const GOOGLE_DOC = GOOGLE_DOC_MIME;
const POLL_MS = 10 * 60 * 1000;
const STALE_SYNC_SCAN_MS = 60 * 1000;
const SYNC_HEARTBEAT_MS = 60 * 1000;
const SYNC_LEASE_STALE_MS = 5 * 60 * 1000;
const OUTBOX_PROCESSING_STALE_MS = 60 * 60 * 1000;

type LinkedFolder = { id: string; connectionId: string; projectId: string | null; externalId: string; name: string; suspendedAt: Date | null; connection: { workspaceId: string; status: IntegrationStatus } };
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
  private staleSyncTimer?: NodeJS.Timeout;
  private processingOutbox = false;
  private outboxRetryTimer?: NodeJS.Timeout;
  private outboxRetryAt?: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleAdapter,
    private readonly googleCredentials: GoogleCredentialsService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.poll().catch(error => this.logger.error('google poll failed', error instanceof Error ? error.stack : undefined)), POLL_MS);
    this.timer.unref();
    this.staleSyncTimer = setInterval(() => void this.recoverStaleLinks().catch(error => this.logger.error('google stale sync recovery failed', error instanceof Error ? error.stack : undefined)), STALE_SYNC_SCAN_MS);
    this.staleSyncTimer.unref();
    setImmediate(() => void this.poll().catch(error => this.logger.error('google startup poll failed', error instanceof Error ? error.stack : undefined)));
    setImmediate(() => void this.recoverStaleLinks().catch(error => this.logger.error('google startup stale sync recovery failed', error instanceof Error ? error.stack : undefined)));
    setImmediate(() => void this.processOutbox().catch(error => this.logger.error('google outbox recovery failed', error instanceof Error ? error.stack : undefined)));
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    if (this.staleSyncTimer) clearInterval(this.staleSyncTimer);
    if (this.outboxRetryTimer) clearTimeout(this.outboxRetryTimer);
  }

  private scheduleOutboxRetry(delayMs: number) {
    const dueAt = Date.now() + delayMs;
    if (this.outboxRetryTimer && this.outboxRetryAt !== undefined && this.outboxRetryAt <= dueAt) return;
    if (this.outboxRetryTimer) clearTimeout(this.outboxRetryTimer);
    this.outboxRetryAt = dueAt;
    this.outboxRetryTimer = setTimeout(() => {
      this.outboxRetryTimer = undefined;
      this.outboxRetryAt = undefined;
      void this.processOutbox().catch(error => this.logger.error('google outbox scheduled retry failed', error instanceof Error ? error.stack : undefined));
    }, Math.max(250, delayMs));
    this.outboxRetryTimer.unref();
  }

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
    try { await requireWorkspaceOwner(this.prisma, userId, workspaceId); }
    catch (error) { if (error instanceof ForbiddenException) throw new ForbiddenException('Somente Owner pode sincronizar pastas vinculadas ao workspace'); throw error; }
  }

  async syncNow(userId: string, workspaceId: string, linkId: string) {
    const link = await this.prisma.googleDriveFolderLink.findFirst({ where: { id: linkId, suspendedAt: null, connection: { workspaceId } }, select: { id: true, projectId: true } });
    if (!link) throw new NotFoundException('Vínculo de pasta não encontrado');
    if (link.projectId) await requireProjectManagerOrOwner(this.prisma, userId, link.projectId);
    else await this.owner(userId, workspaceId);
    await this.prisma.googleDriveOutbox.updateMany({
      where: { googleDriveFolderLinkId: link.id, status: GoogleDriveOutboxStatus.FAILED },
      data: { status: GoogleDriveOutboxStatus.PENDING, attempts: 0, availableAt: new Date(), completedAt: null, error: null },
    });
    await this.prisma.googleDriveOutbox.updateMany({
      where: { googleDriveFolderLinkId: link.id, status: GoogleDriveOutboxStatus.PENDING },
      data: { availableAt: new Date() },
    });
    await this.processOutbox();
    return this.syncLink(link.id);
  }

  async poll() {
    await this.processOutbox();
    const links = await this.prisma.googleDriveFolderLink.findMany({ where: { projectId: { not: null }, suspendedAt: null, connection: { status: IntegrationStatus.CONNECTED } }, select: { id: true } });
    await Promise.all(links.map(link => this.syncLink(link.id).catch(error => this.logger.warn(`google sync failed link=${link.id}: ${error instanceof Error ? error.message : 'unknown'}`))));
  }

  private async recoverStaleLinks() {
    const staleBefore = new Date(Date.now() - SYNC_LEASE_STALE_MS);
    const links = await this.prisma.googleDriveFolderLink.findMany({
      where: { suspendedAt: null, syncStatus: GoogleSyncStatus.RUNNING, OR: [{ syncHeartbeatAt: null }, { syncHeartbeatAt: { lt: staleBefore } }] },
      select: { id: true },
    });
    await Promise.all(links.map(link => this.syncLink(link.id).catch(error => this.logger.warn(`google stale sync recovered with error link=${link.id}: ${error instanceof Error ? error.message : 'unknown'}`))));
  }

  private async link(id: string): Promise<LinkedFolder | null> {
    return this.prisma.googleDriveFolderLink.findUnique({ where: { id }, include: { connection: { select: { workspaceId: true, status: true } } } }) as Promise<LinkedFolder | null>;
  }

  private async ensureFolder(link: LinkedFolder, externalId: string, name: string, parentExternalId: string | null, parentId: string | null) {
    if (!link.projectId) throw new ConflictException('O vínculo do Drive está sem projeto de destino');
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
    const existing = await this.prisma.requirementFolder.findFirst({ where: { projectId: link.projectId, parentId, name: { equals: name, mode: 'insensitive' } } });
    const folder = existing
      ? existing.name === name ? existing : await this.prisma.requirementFolder.update({ where: { id: existing.id }, data: { name } })
      : await this.prisma.requirementFolder.create({ data: { workspaceId: link.connection.workspaceId, projectId: link.projectId, parentId, name } });
    await this.prisma.googleDriveFolderMapping.create({ data: { googleDriveFolderLinkId: link.id, externalId, parentExternalId, name, folderId: folder.id } });
    return folder.id;
  }

  private async fallbackFolder(link: LinkedFolder) {
    if (!link.projectId) throw new ConflictException('O vínculo do Drive está sem projeto de destino');
    const current = await this.prisma.requirementFolder.findFirst({
      where: { projectId: link.projectId, name: 'Sem pasta', parentId: null },
    });
    return current ?? this.prisma.requirementFolder.create({
      data: { workspaceId: link.connection.workspaceId, projectId: link.projectId, name: 'Sem pasta', description: 'Requisitos ainda não classificados' },
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
    const now = new Date();
    const leaseId = randomUUID();
    const claimed = await this.prisma.googleDriveFolderLink.updateMany({
      where: {
        id,
        suspendedAt: null,
        OR: [
          { syncStatus: { not: GoogleSyncStatus.RUNNING } },
          { syncStatus: GoogleSyncStatus.RUNNING, OR: [{ syncHeartbeatAt: null }, { syncHeartbeatAt: { lt: new Date(now.getTime() - SYNC_LEASE_STALE_MS) } }] },
        ],
      },
      data: { syncStatus: GoogleSyncStatus.RUNNING, syncStartedAt: now, syncHeartbeatAt: now, syncLeaseId: leaseId, syncError: null },
    });
    if (claimed.count !== 1) return { linkId: id, skipped: true };
    let changed = 0;
    let scanned = 0;
    let runId: string | undefined;
    let heartbeatInFlight = false;
    let leaseLost = false;
    const heartbeat = setInterval(() => {
      if (heartbeatInFlight || leaseLost) return;
      heartbeatInFlight = true;
      void this.prisma.googleDriveFolderLink.updateMany({
        where: { id, syncStatus: GoogleSyncStatus.RUNNING, syncLeaseId: leaseId },
        data: { syncHeartbeatAt: new Date() },
      }).then(result => {
        if (result.count !== 1) {
          leaseLost = true;
          clearInterval(heartbeat);
        }
      }).catch(error => this.logger.warn(`google sync heartbeat failed link=${id}: ${error instanceof Error ? error.message : 'unknown'}`)).finally(() => {
        heartbeatInFlight = false;
      });
    }, SYNC_HEARTBEAT_MS);
    heartbeat.unref();
    const assertLease = () => {
      if (leaseLost) throw new ConflictException('Esta sincronização perdeu a trava; tente sincronizar novamente.');
    };

    try {
      const link = await this.link(id);
      if (!link) throw new NotFoundException('Vínculo de pasta não encontrado');
      if (link.suspendedAt) throw new ConflictException('A sincronização foi pausada porque o projeto mudou de workspace. Configure um novo vínculo para continuar.');
      if (!link.projectId) throw new ConflictException('O vínculo do Drive está sem projeto de destino. Selecione um projeto novamente.');
      if (link.connection.status !== IntegrationStatus.CONNECTED) throw new ConflictException('A conexão Google não está ativa. Reconecte o Google Drive.');
      const run = await this.prisma.googleDriveSyncRun.create({ data: { googleDriveFolderLinkId: id, status: GoogleSyncStatus.RUNNING } });
      runId = run.id;
      const credentials = await this.googleCredentials.valid(link.connection.workspaceId);
      assertLease();
      await this.flattenLegacyRoot(link);
      const fallback = await this.fallbackFolder(link);
      const seen = new Set<string>();
      const visit = async (driveFolderId: string, athenaParentId: string | null) => {
        let pageToken: string | undefined;
        do {
          assertLease();
          const page = await this.google.listFolderFiles(credentials.accessToken, driveFolderId, pageToken);
          for (const file of page.files) {
            assertLease();
            if (file.mimeType === 'application/vnd.google-apps.folder') {
              const childFolderId = await this.ensureFolder(link, file.id, file.name, driveFolderId, athenaParentId);
              await visit(file.id, childFolderId);
            } else if (READABLE_GOOGLE_MIME_TYPES.has(file.mimeType)) {
              scanned += 1;
              seen.add(`google:drive:${file.id}`);
              const read = await this.google.readFile(credentials.accessToken, file);
              assertLease();
              if (await this.applyRemote(link, run.id, file, read.content, read.document ?? this.document(read.content), athenaParentId ?? fallback.id)) changed += 1;
            }
          }
          pageToken = page.nextPageToken;
        } while (pageToken);
      };
      // The linked folder is a boundary, not an ATHENA folder. Its direct
      // child folders become the top-level folders in the project overview.
      await visit(link.externalId, null);
      assertLease();
      changed += await this.archiveMissing(link, seen);
      assertLease();
      const completedAt = new Date();
      const completed = await this.prisma.$transaction([
        this.prisma.googleDriveFolderLink.updateMany({ where: { id, syncStatus: GoogleSyncStatus.RUNNING, syncLeaseId: leaseId }, data: { syncStatus: GoogleSyncStatus.COMPLETED, syncError: null, lastSyncedAt: completedAt, syncHeartbeatAt: null, syncLeaseId: null } }),
        this.prisma.googleDriveSyncRun.update({ where: { id: run.id }, data: { status: GoogleSyncStatus.COMPLETED, completedAt, scannedCount: scanned, changedCount: changed } }),
      ]);
      if (completed[0] && completed[0].count !== 1) throw new ConflictException('Esta sincronização perdeu a trava antes de concluir.');
      return { linkId: id, runId: run.id, changed, scanned, status: GoogleSyncStatus.COMPLETED };
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'Falha desconhecida').slice(0, 1000);
      const completedAt = new Date();
      const linkFailure = this.prisma.googleDriveFolderLink.updateMany({ where: { id, syncLeaseId: leaseId }, data: { syncStatus: GoogleSyncStatus.FAILED, syncError: message, syncHeartbeatAt: null, syncLeaseId: null } });
      if (runId) {
        await this.prisma.$transaction([
          linkFailure,
          this.prisma.googleDriveSyncRun.update({ where: { id: runId }, data: { status: GoogleSyncStatus.FAILED, error: message, completedAt, scannedCount: scanned, changedCount: changed } }),
        ]);
      } else {
        await linkFailure;
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
      // If error recording itself failed, clear this lease so a later poll can
      // recover the link instead of leaving it RUNNING forever.
      await this.prisma.googleDriveFolderLink.updateMany({ where: { id, syncLeaseId: leaseId }, data: { syncHeartbeatAt: null, syncLeaseId: null } }).catch(error => {
        this.logger.error(`google sync lease cleanup failed link=${id}: ${error instanceof Error ? error.message : 'unknown'}`);
      });
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
      await this.queueRequirement(requirement.id, GoogleDriveOutboxOperation.UPDATE);
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
    const requirement = await this.prisma.requirement.findUnique({
      where: { id: requirementId },
      select: { id: true, projectId: true, folderId: true, revision: true, updatedAt: true, status: true, archivedAt: true },
    });
    if (!requirement) return;
    const source = await this.prisma.integrationSource.findFirst({ where: { canonicalRequirementId: requirementId, googleDriveFolderLinkId: { not: null }, googleDriveFolderLink: { is: { suspendedAt: null } } }, select: { id: true, googleDriveFolderLinkId: true } });
    if (operation === GoogleDriveOutboxOperation.ARCHIVE && !source) return;

    let linkId = source?.googleDriveFolderLinkId ?? null;
    if (!linkId) {
      const mapping = await this.prisma.googleDriveFolderMapping.findFirst({
        where: { folderId: requirement.folderId, googleDriveFolderLink: { projectId: requirement.projectId, suspendedAt: null } },
        orderBy: { createdAt: 'asc' }, select: { googleDriveFolderLinkId: true },
      });
      linkId = mapping?.googleDriveFolderLinkId ?? null;
    }
    if (!linkId) {
      const root = await this.prisma.googleDriveFolderLink.findFirst({ where: { projectId: requirement.projectId, isExportRoot: true, suspendedAt: null }, select: { id: true } });
      linkId = root?.id ?? null;
    }
    // Local saves do not depend on Drive being configured. Selecting a root
    // later queues existing requirements for automatic export.
    if (!linkId) return;
    const effectiveOperation = !source && operation !== GoogleDriveOutboxOperation.ARCHIVE
      ? GoogleDriveOutboxOperation.CREATE
      : operation;
    const version = effectiveOperation === GoogleDriveOutboxOperation.CREATE ? 'create' : String(requirement.revision ?? requirement.updatedAt?.getTime?.() ?? 'current');
    await this.enqueueRequirement(requirementId, effectiveOperation, source?.id, linkId, `google:req:${linkId}:${requirementId}:${effectiveOperation}:${version}`);
    setImmediate(() => void this.processOutbox().catch(error => this.logger.error('google outbox write failed', error instanceof Error ? error.stack : undefined)));
  }

  async queueProjectRequirements(projectId: string) {
    const requirements = await this.prisma.requirement.findMany({
      where: { projectId, status: RequirementStatus.ACTIVE, archivedAt: null, integrationSource: null },
      select: { id: true, folderId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!requirements.length) return;
    const folderIds = [...new Set(requirements.map(requirement => requirement.folderId))];
    const [mappings, root] = await Promise.all([
      this.prisma.googleDriveFolderMapping.findMany({
        where: { folderId: { in: folderIds }, googleDriveFolderLink: { projectId, suspendedAt: null } },
        orderBy: { createdAt: 'asc' },
        select: { folderId: true, googleDriveFolderLinkId: true },
      }),
      this.prisma.googleDriveFolderLink.findFirst({ where: { projectId, isExportRoot: true, suspendedAt: null }, select: { id: true } }),
    ]);
    const mappingByFolder = new Map<string, string>();
    for (const mapping of mappings) if (!mappingByFolder.has(mapping.folderId)) mappingByFolder.set(mapping.folderId, mapping.googleDriveFolderLinkId);
    const rows = requirements.flatMap(requirement => {
      const linkId = mappingByFolder.get(requirement.folderId) ?? root?.id;
      if (!linkId) return [];
      return [{
        googleDriveFolderLinkId: linkId,
        requirementId: requirement.id,
        operation: GoogleDriveOutboxOperation.CREATE,
        payload: {},
        idempotencyKey: `google:req:${linkId}:${requirement.id}:CREATE:create`,
      }];
    });
    if (!rows.length) return;
    await this.prisma.googleDriveOutbox.createMany({ data: rows, skipDuplicates: true });
    await this.prisma.googleDriveOutbox.updateMany({
      where: { idempotencyKey: { in: rows.map(row => row.idempotencyKey) }, status: GoogleDriveOutboxStatus.FAILED },
      data: { status: GoogleDriveOutboxStatus.PENDING, attempts: 0, availableAt: new Date(), completedAt: null, error: null },
    });
    setImmediate(() => void this.processOutbox().catch(error => this.logger.error('google project export failed', error instanceof Error ? error.stack : undefined)));
  }

  private async enqueueRequirement(requirementId: string, operation: GoogleDriveOutboxOperation, integrationSourceId: string | undefined, linkId: string, idempotencyKey: string) {
    try {
      await this.prisma.googleDriveOutbox.create({ data: { googleDriveFolderLinkId: linkId, integrationSourceId: integrationSourceId ?? null, requirementId, operation, payload: {}, idempotencyKey } });
    } catch (error) {
      // A duplicate stable key means an equivalent operation is already
      // pending, processing, completed, or retained as a failed attempt.
      if ((error as { code?: string })?.code !== 'P2002') throw error;
    }
  }

  async queueFolder(folderId: string, operation: GoogleDriveOutboxOperation) {
    const folder = await this.prisma.requirementFolder.findUnique({ where: { id: folderId }, select: { id: true, projectId: true, updatedAt: true } });
    if (!folder?.projectId) return;
    const mappings = await this.prisma.googleDriveFolderMapping.findMany({
      where: { folderId, googleDriveFolderLink: { projectId: folder.projectId, suspendedAt: null } },
      select: { googleDriveFolderLinkId: true }, orderBy: { createdAt: 'asc' },
    });
    const linkIds = [...new Set(mappings.map((mapping: { googleDriveFolderLinkId: string }) => mapping.googleDriveFolderLinkId))];
    if (!linkIds.length) {
      const root = await this.prisma.googleDriveFolderLink.findFirst({ where: { projectId: folder.projectId, isExportRoot: true, suspendedAt: null }, select: { id: true } });
      if (root) linkIds.push(root.id);
    }
    for (const linkId of linkIds) {
      const key = `google:folder:${linkId}:${folder.id}:${operation}:${folder.updatedAt?.getTime?.() ?? 'current'}`;
      await this.prisma.googleDriveOutbox.create({ data: { googleDriveFolderLinkId: linkId, folderId, operation, payload: { athenaFolderId: folder.id }, idempotencyKey: key } }).catch((error: { code?: string }) => {
        if (error?.code !== 'P2002') throw error;
      });
    }
    if (linkIds.length) setImmediate(() => void this.processOutbox().catch(error => this.logger.error('google outbox folder write failed', error instanceof Error ? error.stack : undefined)));
  }

  async queueProjectFolders(projectId: string, linkId?: string) {
    const folders = await this.prisma.requirementFolder.findMany({ where: { projectId }, select: { id: true }, orderBy: [{ parentId: 'asc' }, { name: 'asc' }] });
    for (const folder of folders) {
      if (linkId) {
        await this.prisma.googleDriveOutbox.create({ data: { googleDriveFolderLinkId: linkId, folderId: folder.id, operation: GoogleDriveOutboxOperation.CREATE_FOLDER, payload: { athenaFolderId: folder.id }, idempotencyKey: `google:folder:${linkId}:${folder.id}:initial` } }).catch((error: { code?: string }) => {
          if (error?.code !== 'P2002') throw error;
        });
      } else {
        await this.queueFolder(folder.id, GoogleDriveOutboxOperation.CREATE_FOLDER);
      }
    }
    setImmediate(() => void this.processOutbox().catch(error => this.logger.error('google outbox folder write failed', error instanceof Error ? error.stack : undefined)));
  }

  async queueDeletedFolder(folderId: string, linkId: string, externalId?: string, requirementIds: string[] = []) {
    await this.prisma.googleDriveOutbox.create({
      data: {
        googleDriveFolderLinkId: linkId, folderId: null, operation: GoogleDriveOutboxOperation.DELETE_FOLDER,
        payload: { deletedFolderId: folderId, ...(externalId ? { externalId } : {}), requirementIds }, idempotencyKey: `google:folder-delete:${linkId}:${folderId}`,
      },
    }).catch((error: { code?: string }) => { if (error?.code !== 'P2002') throw error; });
    setImmediate(() => void this.processOutbox().catch(error => this.logger.error('google outbox folder delete failed', error instanceof Error ? error.stack : undefined)));
  }

  private async processOutbox() {
    if (this.processingOutbox) return;
    if (this.outboxRetryTimer) clearTimeout(this.outboxRetryTimer);
    this.outboxRetryTimer = undefined;
    this.outboxRetryAt = undefined;
    this.processingOutbox = true;
    try {
      const staleBefore = new Date(Date.now() - OUTBOX_PROCESSING_STALE_MS);
      const recovered = await this.prisma.googleDriveOutbox.updateMany({
        where: { status: GoogleDriveOutboxStatus.PROCESSING, updatedAt: { lt: staleBefore } },
        data: { status: GoogleDriveOutboxStatus.PENDING, availableAt: new Date(), error: 'Execução interrompida; operação recolocada na fila.' },
      });
      if (recovered.count) this.logger.warn(`google outbox recovered stale operations=${recovered.count}`);
      for (;;) {
        const row = await this.prisma.googleDriveOutbox.findFirst({ where: { status: GoogleDriveOutboxStatus.PENDING, availableAt: { lte: new Date() }, googleDriveFolderLink: { is: { suspendedAt: null } } }, orderBy: { createdAt: 'asc' }, include: { googleDriveFolderLink: { include: { connection: true } }, integrationSource: true, requirement: { include: { folder: true } }, folder: true } });
        if (!row) return;
        const claim = await this.prisma.googleDriveOutbox.updateMany({ where: { id: row.id, status: GoogleDriveOutboxStatus.PENDING, googleDriveFolderLink: { is: { suspendedAt: null } } }, data: { status: GoogleDriveOutboxStatus.PROCESSING, attempts: { increment: 1 }, error: null } });
        if (claim.count !== 1) continue;
        try {
          const written = await this.writeOutbox(row);
          if (written === false || written === null) {
            // A folder's remote trash operation waits for its queued document
            // moves and any in-flight folder creation to settle. Deferral is
            // not a failed Drive attempt.
            const delayMs = written === false ? 5_000 : POLL_MS;
            await this.prisma.googleDriveOutbox.update({ where: { id: row.id }, data: { status: GoogleDriveOutboxStatus.PENDING, attempts: { decrement: 1 }, availableAt: new Date(Date.now() + delayMs), error: 'Aguardando a realocação dos documentos antes de enviar a pasta à Lixeira.' } });
            if (written === false) this.scheduleOutboxRetry(delayMs);
            continue;
          }
          await this.prisma.googleDriveOutbox.update({ where: { id: row.id }, data: { status: GoogleDriveOutboxStatus.COMPLETED, completedAt: new Date(), error: null } });
        } catch (error) {
          const attempts = row.attempts + 1;
          const delayMs = Math.min(600_000, 1000 * 2 ** attempts);
          const status = attempts >= 5 ? GoogleDriveOutboxStatus.FAILED : GoogleDriveOutboxStatus.PENDING;
          await this.prisma.googleDriveOutbox.update({ where: { id: row.id }, data: { status, availableAt: new Date(Date.now() + delayMs), error: (error instanceof Error ? error.message : 'Falha desconhecida').slice(0, 1000) } });
          if (status === GoogleDriveOutboxStatus.PENDING) this.scheduleOutboxRetry(delayMs);
        }
      }
    } finally { this.processingOutbox = false; }
  }

  async processPendingOutbox() {
    return this.processOutbox();
  }

  private async ensureRemoteFolder(link: LinkedFolder, accessToken: string, folderId: string): Promise<string> {
    const mapping = await this.prisma.googleDriveFolderMapping.findFirst({ where: { googleDriveFolderLinkId: link.id, folderId } });
    if (mapping) return mapping.externalId;
    if (!link.projectId) throw new ConflictException('O vínculo do Drive está sem projeto de destino');
    const folder = await this.prisma.requirementFolder.findFirst({ where: { id: folderId, projectId: link.projectId } });
    if (!folder) throw new NotFoundException('A pasta ATHENA não pertence a este projeto');
    if (folder.name.localeCompare('Sem pasta', 'pt-BR', { sensitivity: 'base' }) === 0 && !folder.parentId) return link.externalId;
    const parentExternalId = folder.parentId ? await this.ensureRemoteFolder(link, accessToken, folder.parentId) : link.externalId;
    const folderMarker = `${link.id}:${folder.id}`;
    const marker = { athenaFolderLinkId: folderMarker };
    const alreadyCreated = await this.google.findByAppProperty(accessToken, 'athenaFolderLinkId', folderMarker);
    const remote = alreadyCreated ?? await this.google.createFolder(accessToken, folder.name, parentExternalId, marker);
    await this.prisma.googleDriveFolderMapping.upsert({
      where: { googleDriveFolderLinkId_externalId: { googleDriveFolderLinkId: link.id, externalId: remote.id } },
      create: { googleDriveFolderLinkId: link.id, externalId: remote.id, parentExternalId, name: folder.name, folderId: folder.id },
      update: { parentExternalId, name: folder.name, folderId: folder.id },
    });
    return remote.id;
  }

  private async destinationId(link: LinkedFolder, accessToken: string, folderId: string) {
    return this.ensureRemoteFolder(link, accessToken, folderId);
  }

  private async archiveFolder(accessToken: string, link: { id: string; externalId: string }, credentials: string) {
    const marked = await this.google.findByAppProperty(accessToken, 'athenaArchiveLinkId', link.id);
    if (marked) return marked.id;
    const listed = await this.google.listFolderFiles(credentials, link.externalId);
    const current = listed.files.find(file => file.mimeType === 'application/vnd.google-apps.folder' && file.name === 'Arquivados');
    return current?.id ?? (await this.google.createFolder(accessToken, 'Arquivados', link.externalId, { athenaArchiveLinkId: link.id })).id;
  }

  private async writeOutbox(row: any): Promise<boolean | null | void> {
    const { requirement, googleDriveFolderLink: link } = row;
    const currentLink = await this.prisma.googleDriveFolderLink.findUnique({ where: { id: link.id }, select: { suspendedAt: true } });
    if (!currentLink || currentLink.suspendedAt) {
      await this.prisma.googleDriveOutbox.update({ where: { id: row.id }, data: { status: GoogleDriveOutboxStatus.PENDING, availableAt: new Date(Date.now() + POLL_MS), error: 'A operação aguarda a reconexão do projeto no workspace atual.' } });
      return null;
    }
    if (link.connection.status !== IntegrationStatus.CONNECTED) throw new NotFoundException('Conexão Google não está ativa');
    const credentials = await this.googleCredentials.valid(link.connection.workspaceId);
    if (row.operation === GoogleDriveOutboxOperation.DELETE_FOLDER) {
      const payload = (row.payload as { externalId?: string; deletedFolderId?: string; requirementIds?: string[] } | null) ?? {};
      const deletedFolderId = payload.deletedFolderId;
      const requirementIds = payload.requirementIds ?? [];
      const waitingStatuses = [GoogleDriveOutboxStatus.PENDING, GoogleDriveOutboxStatus.PROCESSING, GoogleDriveOutboxStatus.FAILED];
      if (requirementIds.length) {
        const pendingRequirementWrites = await this.prisma.googleDriveOutbox.findMany({
          where: { googleDriveFolderLinkId: link.id, requirementId: { in: requirementIds }, operation: { in: [GoogleDriveOutboxOperation.CREATE, GoogleDriveOutboxOperation.MOVE] }, status: { in: waitingStatuses } },
          select: { id: true, status: true },
        });
        if (pendingRequirementWrites.some((pending: { status: GoogleDriveOutboxStatus }) => pending.status === GoogleDriveOutboxStatus.FAILED)) return null;
        if (pendingRequirementWrites.length) return false;
      }
      if (deletedFolderId) {
        const pendingFolderWrites = await this.prisma.googleDriveOutbox.findMany({
          where: { googleDriveFolderLinkId: link.id, operation: { in: [GoogleDriveOutboxOperation.CREATE_FOLDER, GoogleDriveOutboxOperation.UPDATE_FOLDER, GoogleDriveOutboxOperation.MOVE_FOLDER] }, status: { in: waitingStatuses } },
          select: { payload: true, status: true },
        });
        const writesForDeletedFolder = pendingFolderWrites.filter((pending: { payload: unknown }) => (pending.payload as { athenaFolderId?: string } | null)?.athenaFolderId === deletedFolderId);
        if (writesForDeletedFolder.some((pending: { status: GoogleDriveOutboxStatus }) => pending.status === GoogleDriveOutboxStatus.FAILED)) return null;
        if (writesForDeletedFolder.length) return false;
      }
      let externalId = payload.externalId;
      if (!externalId && deletedFolderId) {
        const remoteFolder = await this.google.findByAppProperty(credentials.accessToken, 'athenaFolderLinkId', `${link.id}:${deletedFolderId}`);
        externalId = remoteFolder?.id;
      }
      if (externalId) await this.google.trashFile(credentials.accessToken, externalId);
      return;
    }
    if ([GoogleDriveOutboxOperation.CREATE_FOLDER, GoogleDriveOutboxOperation.UPDATE_FOLDER, GoogleDriveOutboxOperation.MOVE_FOLDER].includes(row.operation)) {
      if (!row.folder) return; // The folder was removed before its create ran.
      const currentMapping = await this.prisma.googleDriveFolderMapping.findFirst({ where: { googleDriveFolderLinkId: link.id, folderId: row.folder.id } });
      if (!link.isExportRoot && !currentMapping) return; // A queued root write became stale after an OWNER changed the root.
      const remoteId = await this.ensureRemoteFolder(link, credentials.accessToken, row.folder.id);
      if (row.operation !== GoogleDriveOutboxOperation.CREATE_FOLDER) {
        await this.google.updateFileName(credentials.accessToken, remoteId, row.folder.name);
        const parentId = row.folder.parentId ? await this.ensureRemoteFolder(link, credentials.accessToken, row.folder.parentId) : link.externalId;
        await this.google.moveFile(credentials.accessToken, remoteId, parentId);
        await this.prisma.googleDriveFolderMapping.updateMany({ where: { googleDriveFolderLinkId: link.id, folderId: row.folder.id }, data: { name: row.folder.name, parentExternalId: parentId === link.externalId ? null : parentId } });
      }
      return;
    }
    if (!requirement) return;
    const text = this.plain(requirement.content);
    const fingerprint = this.requirementFingerprint(requirement);
    let source = row.integrationSource;
    if (!source && row.operation !== GoogleDriveOutboxOperation.ARCHIVE) {
      const mapping = await this.prisma.googleDriveFolderMapping.findFirst({ where: { googleDriveFolderLinkId: link.id, folderId: requirement.folderId } });
      if (!link.isExportRoot && !mapping) return; // The requirement will be included in the new root's explicit export preview.
      const destination = await this.destinationId(link, credentials.accessToken, requirement.folderId);
      const marker = { athenaRequirementLinkId: `${link.id}:${requirement.id}` };
      const existing = await this.google.findByAppProperty(credentials.accessToken, 'athenaRequirementLinkId', `${link.id}:${requirement.id}`);
      const document = existing
        ? { documentId: existing.id, title: existing.name }
        : await this.google.createDocument(credentials.accessToken, requirement.title, destination, marker);
      if (document.title !== requirement.title) await this.google.updateFileName(credentials.accessToken, document.documentId, requirement.title);
      await this.google.replaceDocument(credentials.accessToken, document.documentId, requirement.content);
      source = await this.prisma.integrationSource.upsert({
        where: { connectionId_externalId: { connectionId: link.connectionId, externalId: `google:drive:${document.documentId}` } },
        create: { connectionId: link.connectionId, externalId: `google:drive:${document.documentId}`, name: requirement.title, mimeType: GOOGLE_DOC, googleDriveFolderLinkId: link.id, canonicalRequirementId: requirement.id, lastPushedFingerprint: fingerprint, lastRemoteFingerprint: fingerprint },
        update: { name: requirement.title, mimeType: GOOGLE_DOC, googleDriveFolderLinkId: link.id, canonicalRequirementId: requirement.id, removedAt: null, lastPushedFingerprint: fingerprint, lastRemoteFingerprint: fingerprint },
      });
      return;
    }
    if (!source) return;
    const fileId = source.externalId.replace(/^google:drive:/, '');
    if (row.operation === GoogleDriveOutboxOperation.ARCHIVE || requirement.archivedAt) {
      const destination = await this.archiveFolder(credentials.accessToken, link, credentials.accessToken);
      await this.google.moveFile(credentials.accessToken, fileId, destination);
    } else {
      if (row.operation === GoogleDriveOutboxOperation.MOVE) await this.google.moveFile(credentials.accessToken, fileId, await this.destinationId(link, credentials.accessToken, requirement.folderId));
      await this.google.updateFileName(credentials.accessToken, fileId, requirement.title);
      if (source.mimeType === GOOGLE_DOC) await this.google.replaceDocument(credentials.accessToken, fileId, requirement.content);
      else await this.google.updateTextFile(credentials.accessToken, fileId, text);
    }
    await this.prisma.integrationSource.update({ where: { id: source.id }, data: { name: requirement.title, lastPushedFingerprint: fingerprint } });
  }
}
