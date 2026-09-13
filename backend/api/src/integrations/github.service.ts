import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { IntegrationKind, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { IntegrationsService } from './integrations.service';
import { GithubAdapter, GithubSelection, mapGithubError } from './github.adapter';

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  constructor(private readonly prisma: PrismaService, private readonly integrations: IntegrationsService, private readonly github: GithubAdapter) {}

  private async owner(userId: string, workspaceId: string) {
    const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!member || member.role !== WorkspaceRole.OWNER) throw new ForbiddenException('Somente OWNER pode operar a integração GitHub');
  }
  private async token(workspaceId: string) { return this.integrations.activeCredentials(workspaceId, IntegrationKind.GITHUB); }

  async account(userId: string, workspaceId: string) {
    await this.owner(userId, workspaceId); try { return await this.github.validateAccount((await this.token(workspaceId)).token); } catch (e) { return mapGithubError(e); }
  }
  async repositories(userId: string, workspaceId: string, page = 1) {
    await this.owner(userId, workspaceId); try { return await this.github.listRepositories((await this.token(workspaceId)).token, page); } catch (e) { return mapGithubError(e); }
  }
  async importSources(userId: string, workspaceId: string, selections: GithubSelection[]) {
    await this.owner(userId, workspaceId);
    const credentials = await this.token(workspaceId); const connection = await this.prisma.integrationConnection.findUniqueOrThrow({ where: { workspaceId_kind: { workspaceId, kind: IntegrationKind.GITHUB } } });
    const imported: any[] = []; const failed: Array<{ externalId: string; reason: string }> = [];
    for (const selection of selections) {
      const normalized = { owner: selection.owner.trim(), repository: selection.repository.trim(), path: selection.path.replace(/^\/+|\/+$/g, '') };
      const externalId = `github:${normalized.owner}/${normalized.repository}:${normalized.path}`;
      try {
        const read = await this.github.readSource(credentials.token, normalized);
        const synced = typeof this.integrations.syncCandidate === 'function'
          ? await this.integrations.syncCandidate(userId, workspaceId, IntegrationKind.GITHUB, { externalId, title: read.title, content: read.content, mimeType: 'text/plain', externalVersion: read.sha })
          : { candidate: await this.legacyCandidate(connection, externalId, normalized, read), changed: true };
        imported.push({ id: synced.candidate.id, externalId: synced.candidate.externalId, title: synced.candidate.title, status: synced.candidate.status, sourceId: synced.candidate.sourceId, changed: synced.changed });
      } catch (error) {
        if ((error as any)?.code === 'NOT_FOUND') { failed.push({ externalId, reason: 'SOURCE_REMOVED_OR_INACCESSIBLE' }); continue; }
        if ((error as any)?.code === 'RATE_LIMIT') { this.logger.warn(`integration.github.rate_limit workspace=${workspaceId}`); return mapGithubError(error); }
        return mapGithubError(error);
      }
    }
    return { imported, failed };
  }

  private async legacyCandidate(connection: any, externalId: string, selection: GithubSelection, read: { title: string; content: string; sha?: string }) {
    const source = await this.prisma.integrationSource.upsert({ where: { connectionId_externalId: { connectionId: connection.id, externalId } }, create: { connectionId: connection.id, externalId, name: `${selection.owner}/${selection.repository}/${selection.path}`, mimeType: 'text/plain' }, update: { name: `${selection.owner}/${selection.repository}/${selection.path}`, mimeType: 'text/plain', capturedAt: new Date() } });
    return this.prisma.integrationCandidate.upsert({ where: { connectionId_externalId: { connectionId: connection.id, externalId } }, create: { connectionId: connection.id, sourceId: source.id, externalId, title: read.title, content: { provider: 'GITHUB', ...selection, content: read.content, sha: read.sha ?? null } }, update: { sourceId: source.id, title: read.title, content: { provider: 'GITHUB', ...selection, content: read.content, sha: read.sha ?? null } } });
  }
}
