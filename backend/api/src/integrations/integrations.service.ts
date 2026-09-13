import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IntegrationCandidateChangeType, IntegrationCandidateStatus, IntegrationKind, IntegrationStatus, Prisma, RequirementStatus, RequirementType, WorkspaceRole } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../core/prisma.service';
import { IntegrationCrypto } from './crypto.service';
import { validTipTap } from '../requirements/dto';
import { AiAnalysisJobService } from '../ai/ai-analysis-job.service';

const readRoles = [WorkspaceRole.OWNER, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER];

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  constructor(private readonly prisma: PrismaService, private readonly crypto: IntegrationCrypto, private readonly aiJobs?: AiAnalysisJobService) {}

  private event(event: string, fields: Record<string, string | number | boolean | undefined>) {
    // Only stable identifiers/status/codes are logged. Credentials and source content never enter this payload.
    const safe = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    this.logger.log(`integration.${event} ${JSON.stringify(safe)}`);
  }

  private async member(userId: string, workspaceId: string, roles = readRoles) {
    const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!member || !roles.includes(member.role)) throw new ForbiddenException('Você não tem permissão para esta ação');
    return member;
  }

  private validateCredentials(kind: IntegrationKind, credentials: Record<string, string>) {
    if (![IntegrationKind.GITHUB, IntegrationKind.GOOGLE].includes(kind)) throw new BadRequestException('Provider de integração inválido');
    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) throw new BadRequestException('Credenciais inválidas');
    const secret = kind === IntegrationKind.GITHUB ? credentials.token : credentials.accessToken;
    if (typeof secret !== 'string' || secret.trim().length < 8) throw new BadRequestException('Credencial inválida para o provider');
    if (Object.keys(credentials).some(key => typeof credentials[key] !== 'string')) throw new BadRequestException('Credenciais inválidas');
  }

  private metadata(connection: any) {
    return { id: connection.id, workspaceId: connection.workspaceId, kind: connection.kind, status: connection.status, accountLabel: connection.accountLabel, connectedAt: connection.connectedAt, disconnectedAt: connection.disconnectedAt, createdAt: connection.createdAt, updatedAt: connection.updatedAt };
  }

  async list(userId: string, workspaceId: string) {
    await this.member(userId, workspaceId);
    const rows = await this.prisma.integrationConnection.findMany({ where: { workspaceId }, orderBy: { kind: 'asc' } });
    return rows.map(row => this.metadata(row));
  }

  async connect(userId: string, workspaceId: string, kind: IntegrationKind, credentials: Record<string, string>, accountLabel?: string) {
    await this.member(userId, workspaceId, [WorkspaceRole.OWNER]);
    this.validateCredentials(kind, credentials);
    const encryptedCredentials = this.crypto.encrypt(JSON.stringify(credentials));
    try {
      const row = await this.prisma.integrationConnection.upsert({
        where: { workspaceId_kind: { workspaceId, kind } },
        create: { workspaceId, kind, status: IntegrationStatus.CONNECTED, accountLabel: accountLabel?.trim() || null, encryptedCredentials, connectedAt: new Date(), disconnectedAt: null },
        update: { status: IntegrationStatus.CONNECTED, accountLabel: accountLabel?.trim() || null, encryptedCredentials, connectedAt: new Date(), disconnectedAt: null },
      });
      this.event('connected', { workspaceId, kind, status: row.status });
      return this.metadata(row);
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Já existe uma conexão para este provider');
      throw error;
    }
  }

  async disconnect(userId: string, workspaceId: string, kind: IntegrationKind) {
    await this.member(userId, workspaceId, [WorkspaceRole.OWNER]);
    if (![IntegrationKind.GITHUB, IntegrationKind.GOOGLE].includes(kind)) throw new BadRequestException('Provider de integração inválido');
    const current = await this.prisma.integrationConnection.findUnique({ where: { workspaceId_kind: { workspaceId, kind } } });
    if (!current) throw new NotFoundException('Conexão não encontrada');
    // Do not delete the logical connection: source/candidate history remains available.
    const row = await this.prisma.integrationConnection.update({ where: { id: current.id }, data: { status: IntegrationStatus.DISCONNECTED, encryptedCredentials: null, disconnectedAt: new Date() } });
    this.event('disconnected', { workspaceId, kind, status: row.status });
    return this.metadata(row);
  }

  /** Internal-only credential access for future import jobs. Disconnected connections are inaccessible. */
  async activeCredentials(workspaceId: string, kind: IntegrationKind): Promise<Record<string, string>> {
    const row = await this.prisma.integrationConnection.findUnique({ where: { workspaceId_kind: { workspaceId, kind } } });
    if (!row || row.status !== IntegrationStatus.CONNECTED || !row.encryptedCredentials) throw new NotFoundException('Conexão ativa não encontrada');
    try { return JSON.parse(this.crypto.decrypt(row.encryptedCredentials)) as Record<string, string>; }
    catch { throw new ConflictException('Credencial da conexão não pode ser lida'); }
  }

  /** Internal refresh path; callers must already have authenticated the connection owner. */
  async replaceCredentials(workspaceId: string, kind: IntegrationKind, credentials: Record<string, string>) {
    const current = await this.prisma.integrationConnection.findUnique({ where: { workspaceId_kind: { workspaceId, kind } } });
    if (!current || current.status !== IntegrationStatus.CONNECTED) throw new NotFoundException('Conexão ativa não encontrada');
    await this.prisma.integrationConnection.update({ where: { id: current.id }, data: { encryptedCredentials: this.crypto.encrypt(JSON.stringify(credentials)) } });
  }

  private safeText(value: unknown, max: number, field: string) {
    if (typeof value !== 'string') throw new BadRequestException(`${field} inválido`);
    const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    if (!clean || clean.length > max) throw new BadRequestException(`${field} inválido`);
    return clean;
  }

  private importedDocument(text: string): Prisma.InputJsonValue {
    // External files are plain text at this boundary. Convert them to the
    // smallest valid TipTap document instead of persisting an ad-hoc JSON
    // shape that the canonical editor cannot open.
    const document = { type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }] };
    const normalized = document.content[0].content ? document : { type: 'doc', content: [{ type: 'paragraph' }] };
    if (!validTipTap(normalized)) throw new BadRequestException('Conteúdo importado inválido');
    return normalized as Prisma.InputJsonValue;
  }

  /** Upserts a source and a reviewable candidate. The canonical requirement is never touched here. */
  async syncCandidate(userId: string, workspaceId: string, kind: IntegrationKind, input: { externalId: string; title: string; content: string; mimeType?: string; externalVersion?: string; googleDriveFolderLinkId?: string }) {
    await this.member(userId, workspaceId, [WorkspaceRole.OWNER]);
    const connection = await this.prisma.integrationConnection.findFirst({ where: { workspaceId, kind, status: IntegrationStatus.CONNECTED } });
    if (!connection) throw new NotFoundException('Conexão ativa não encontrada');
    const externalId = this.safeText(input.externalId, 512, 'Identificador externo');
    const title = this.safeText(input.title, 500, 'Título');
    const content = this.safeText(input.content, 500_000, 'Conteúdo');
    const externalVersion = input.externalVersion?.trim().slice(0, 256) || null;
    if (input.googleDriveFolderLinkId && !(await this.prisma.googleDriveFolderLink.findFirst({ where: { id: input.googleDriveFolderLinkId, connectionId: connection.id } }))) throw new NotFoundException('Vínculo de pasta Google não encontrado');
    const payload = { provider: kind, content, mimeType: input.mimeType ?? 'text/plain' };
    const fingerprint = createHash('sha256').update(JSON.stringify({ title, content, externalVersion })).digest('hex');
    return this.prisma.$transaction(async tx => {
      const source = await tx.integrationSource.upsert({
        where: { connectionId_externalId: { connectionId: connection.id, externalId } },
        create: { connectionId: connection.id, externalId, name: title, mimeType: input.mimeType ?? 'text/plain', externalVersion, lastSeenAt: new Date(), removedAt: null, googleDriveFolderLinkId: input.googleDriveFolderLinkId },
        update: { name: title, mimeType: input.mimeType ?? 'text/plain', externalVersion, lastSeenAt: new Date(), removedAt: null, ...(input.googleDriveFolderLinkId ? { googleDriveFolderLinkId: input.googleDriveFolderLinkId } : {}) },
      });
      const current = await tx.integrationCandidate.findUnique({ where: { connectionId_externalId: { connectionId: connection.id, externalId } } });
      if (current?.fingerprint === fingerprint && current.changeType !== IntegrationCandidateChangeType.REMOVED) {
        this.event('sync_unchanged', { workspaceId, kind, externalId });
        return { candidate: current, changed: false };
      }
      const candidate = current
        ? await tx.integrationCandidate.update({ where: { id: current.id }, data: { sourceId: source.id, title, content: payload, externalVersion, fingerprint, changeType: IntegrationCandidateChangeType.UPDATED, previousTitle: current.title, previousContent: current.content as Prisma.InputJsonValue, status: IntegrationCandidateStatus.PENDING, reviewedAt: null } })
        : await tx.integrationCandidate.create({ data: { connectionId: connection.id, sourceId: source.id, externalId, title, content: payload, externalVersion, fingerprint, changeType: IntegrationCandidateChangeType.CREATED } });
      await tx.integrationCandidateRevision.upsert({
        where: { candidateId_fingerprint: { candidateId: candidate.id, fingerprint } },
        create: { candidateId: candidate.id, externalVersion, title, content: payload, fingerprint },
        // Reappearance of a previously seen source is not a new external
        // revision; retaining the original immutable snapshot is intentional.
        update: {},
      });
      this.event('candidate_changed', { workspaceId, kind, externalId, candidateId: candidate.id });
      return { candidate, changed: true };
    });
  }

  /** Marks the set difference after a provider scan without deleting audit history. */
  async markSourcesMissing(userId: string, workspaceId: string, kind: IntegrationKind, seenExternalIds: string[]) {
    await this.member(userId, workspaceId, [WorkspaceRole.OWNER]);
    const connection = await this.prisma.integrationConnection.findFirst({ where: { workspaceId, kind } });
    if (!connection) throw new NotFoundException('Conexão não encontrada');
    const seen = new Set(seenExternalIds);
    const sources = await this.prisma.integrationSource.findMany({ where: { connectionId: connection.id, removedAt: null } });
    const missing = sources.filter(source => !seen.has(source.externalId));
    if (!missing.length) return { removed: 0 };
    await this.prisma.$transaction(async tx => {
      for (const source of missing) {
        await tx.integrationSource.update({ where: { id: source.id }, data: { removedAt: new Date() } });
        await tx.integrationCandidate.updateMany({ where: { sourceId: source.id, status: IntegrationCandidateStatus.PENDING }, data: { changeType: IntegrationCandidateChangeType.REMOVED, reviewedAt: null } });
      }
    });
    return { removed: missing.length, externalIds: missing.map(source => source.externalId) };
  }

  async candidates(userId: string, workspaceId: string, status?: IntegrationCandidateStatus) {
    await this.member(userId, workspaceId);
    return this.prisma.integrationCandidate.findMany({ where: { connection: { workspaceId }, ...(status ? { status } : {}) }, include: { source: true, revisions: { orderBy: { capturedAt: 'desc' }, take: 2 } }, orderBy: { updatedAt: 'desc' } });
  }

  async candidate(userId: string, id: string) {
    const row = await this.prisma.integrationCandidate.findUnique({ where: { id }, include: { connection: true, source: true, revisions: { orderBy: { capturedAt: 'desc' } } } });
    if (!row) throw new NotFoundException('Candidato não encontrado');
    await this.member(userId, row.connection.workspaceId);
    return row;
  }

  async rejectCandidate(userId: string, id: string, expectedUpdatedAt?: string) {
    const row = await this.candidate(userId, id);
    await this.member(userId, row.connection.workspaceId, [WorkspaceRole.OWNER, WorkspaceRole.EDITOR]);
    if (expectedUpdatedAt && row.updatedAt.toISOString() !== expectedUpdatedAt) throw new ConflictException('Candidato alterado por outra pessoa');
    const updated = await this.prisma.integrationCandidate.updateMany({ where: { id, status: IntegrationCandidateStatus.PENDING, ...(expectedUpdatedAt ? { updatedAt: new Date(expectedUpdatedAt) } : {}) }, data: { status: IntegrationCandidateStatus.DISMISSED, reviewedAt: new Date() } });
    if (updated.count !== 1) throw new ConflictException('Candidato alterado por outra pessoa');
    return this.prisma.integrationCandidate.findUniqueOrThrow({ where: { id } });
  }

  async approveCandidate(userId: string, id: string, input: { projectId: string; folderId?: string; requirementId?: string; expectedUpdatedAt?: string; expectedRevision?: number }) {
    const row = await this.candidate(userId, id);
    await this.member(userId, row.connection.workspaceId, [WorkspaceRole.OWNER, WorkspaceRole.EDITOR]);
    if (row.status !== IntegrationCandidateStatus.PENDING) throw new ConflictException('Candidato já revisado');
    if (input.expectedUpdatedAt && row.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new ConflictException('Candidato alterado por outra pessoa');
    const raw = typeof (row.content as any)?.content === 'string' ? (row.content as any).content : JSON.stringify(row.content);
    const content = this.importedDocument(this.safeText(raw, 500_000, 'Conteúdo'));
    const result = await this.prisma.$transaction(async tx => {
      const project = await tx.project.findFirst({ where: { id: input.projectId, workspaceId: row.connection.workspaceId } });
      if (!project) throw new NotFoundException('Projeto não encontrado neste workspace');
      if (input.requirementId) {
        const current = await tx.requirement.findFirst({ where: { id: input.requirementId, projectId: project.id } });
        if (!current) throw new NotFoundException('Requisito não encontrado neste projeto');
        if (input.expectedRevision !== undefined && current.revision !== input.expectedRevision) throw new ConflictException('Requisito alterado por outra pessoa');
        const updated = await tx.requirement.updateMany({ where: { id: current.id, revision: input.expectedRevision ?? current.revision }, data: { title: row.title, content, source: `INTEGRATION:${row.connection.kind}`, revision: { increment: 1 } } });
        if (updated.count !== 1) throw new ConflictException('Requisito alterado por outra pessoa');
        const requirement = await tx.requirement.findUniqueOrThrow({ where: { id: current.id } });
        await tx.integrationCandidate.update({ where: { id }, data: { status: IntegrationCandidateStatus.ACCEPTED, reviewedAt: new Date() } });
        return requirement;
      }
      const folder = input.folderId
        ? await tx.requirementFolder.findFirst({ where: { id: input.folderId, workspaceId: row.connection.workspaceId } })
        : await tx.requirementFolder.findFirst({ where: { workspaceId: row.connection.workspaceId }, orderBy: { createdAt: 'asc' } });
      if (!folder) throw new NotFoundException('Pasta não encontrada neste workspace');
      const sequence = await tx.project.update({ where: { id: project.id }, data: { requirementSequence: { increment: 1 } }, select: { requirementSequence: true } });
      const requirement = await tx.requirement.create({ data: { projectId: project.id, code: `US-${String(sequence.requirementSequence).padStart(3, '0')}`, type: RequirementType.USER_STORY, status: RequirementStatus.ACTIVE, title: row.title, content, folderId: folder.id, source: `INTEGRATION:${row.connection.kind}` } });
      await tx.integrationCandidate.update({ where: { id }, data: { status: IntegrationCandidateStatus.ACCEPTED, reviewedAt: new Date() } });
      return requirement;
    }, { isolationLevel: 'Serializable' });
    // Start only after commit, so the reader never sees an uncommitted import.
    // An update of an already linked US also changes project context and is a
    // specified trigger for a new global pass.
    void this.aiJobs?.start(result.projectId);
    this.event('candidate_approved', { candidateId: id, projectId: input.projectId });
    return result;
  }
}
