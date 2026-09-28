import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { GoogleSyncStatus, IntegrationKind, IntegrationTaskOperationStatus } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';

type ProviderFilter = 'ALL' | 'GOOGLE' | 'GITHUB' | 'OPENPROJECT';
type StatusFilter = 'ALL' | 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' | 'UNKNOWN';
type Cursor = { at: string; source: 'ACTIVITY' | 'TASK_OPERATION' | 'LEGACY_TASK' | 'GOOGLE_SYNC'; id: string };
const sourceRank: Record<Cursor['source'], number> = { ACTIVITY: 0, TASK_OPERATION: 1, LEGACY_TASK: 2, GOOGLE_SYNC: 3 };
const historyActions = ['INTEGRATION_GITHUB_TASK_CREATED', 'INTEGRATION_OPENPROJECT_TASK_CREATED', 'INTEGRATION_GITHUB_TASK_LINKED', 'INTEGRATION_OPENPROJECT_TASK_LINKED', 'INTEGRATION_GITHUB_TASK_FAILED', 'INTEGRATION_OPENPROJECT_TASK_FAILED', 'INTEGRATION_GITHUB_TASK_UNKNOWN', 'INTEGRATION_OPENPROJECT_TASK_UNKNOWN', 'INTEGRATION_GITHUB_TASK_PROJECT_LINKED', 'INTEGRATION_GITHUB_TASK_PROJECT_FAILED'];
const historyActionsByStatus: Record<StatusFilter, string[]> = {
  ALL: historyActions,
  COMPLETED: historyActions.filter(action => action.endsWith('_TASK_CREATED') || action.endsWith('_TASK_LINKED') || action.endsWith('_TASK_PROJECT_LINKED')),
  FAILED: historyActions.filter(action => action.endsWith('_TASK_FAILED') || action.endsWith('_TASK_PROJECT_FAILED')),
  IN_PROGRESS: [],
  UNKNOWN: historyActions.filter(action => action.endsWith('_TASK_UNKNOWN')),
};

function decodeCursor(value?: string): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (!parsed.at || Number.isNaN(Date.parse(parsed.at)) || !parsed.id || !sourceRank.hasOwnProperty(parsed.source)) return null;
    return parsed;
  } catch { return null; }
}

function afterCursor(source: Cursor['source'], dateField: string, cursor: Cursor | null) {
  if (!cursor) return {};
  const dateBefore = { [dateField]: { lt: new Date(cursor.at) } };
  const rank = sourceRank[source]; const cursorRank = sourceRank[cursor.source];
  if (rank > cursorRank) return { OR: [dateBefore, { [dateField]: new Date(cursor.at) }] };
  if (rank < cursorRank) return { OR: [dateBefore] };
  return { OR: [dateBefore, { [dateField]: new Date(cursor.at), id: { lt: cursor.id } }] };
}

function dateRange(dateField: string, from?: string, to?: string) {
  if (!from && !to) return {};
  return { [dateField]: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lt: new Date(to) } : {}) } };
}

@Injectable()
export class IntegrationActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, workspaceId: string, cursorValue?: string, limit = 30, provider: ProviderFilter = 'ALL', from?: string, to?: string, status: StatusFilter = 'ALL') {
    const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { userId: true } });
    if (!member) throw new ForbiddenException('Você não participa deste workspace');
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { archivedAt: true } });
    if (!workspace || workspace.archivedAt) throw new ForbiddenException('Este workspace está arquivado');
    if (from && to && new Date(from).getTime() >= new Date(to).getTime()) throw new BadRequestException('A data inicial precisa ser anterior à data final');
    const cursor = decodeCursor(cursorValue);
    const take = Math.min(Math.max(limit || 30, 1), 50) + 1;
    const wantGoogle = provider === 'ALL' || provider === 'GOOGLE';
    const wantGithub = provider === 'ALL' || provider === 'GITHUB';
    const wantOpenProject = provider === 'ALL' || provider === 'OPENPROJECT';
    const projectIds = wantGithub || wantOpenProject ? await this.prisma.project.findMany({ where: { workspaceId }, select: { id: true } }) : [];
    const projectIdList = projectIds.map(project => project.id);
    const selectedActions = (status === 'ALL' ? historyActions : historyActionsByStatus[status]).filter(action => provider === 'ALL' || action.includes(provider));
    const operationStatuses: IntegrationTaskOperationStatus[] = status === 'ALL' ? [IntegrationTaskOperationStatus.PENDING, IntegrationTaskOperationStatus.FAILED, IntegrationTaskOperationStatus.UNKNOWN] : status === 'IN_PROGRESS' ? [IntegrationTaskOperationStatus.PENDING] : status === 'FAILED' ? [IntegrationTaskOperationStatus.FAILED] : status === 'UNKNOWN' ? [IntegrationTaskOperationStatus.UNKNOWN] : [];
    const googleStatuses: GoogleSyncStatus[] | undefined = status === 'ALL' ? undefined : status === 'COMPLETED' ? [GoogleSyncStatus.COMPLETED, GoogleSyncStatus.IDLE] : status === 'FAILED' ? [GoogleSyncStatus.FAILED] : status === 'IN_PROGRESS' ? [GoogleSyncStatus.RUNNING] : [];
    const activityWhere = projectIdList.length ? {
      projectId: { in: projectIdList },
      action: { in: selectedActions },
      ...afterCursor('ACTIVITY', 'createdAt', cursor),
      ...dateRange('createdAt', from, to),
    } : null;
    const [runs, activities, operations, legacyLinks] = await Promise.all([
      wantGoogle && googleStatuses?.length !== 0 ? this.prisma.googleDriveSyncRun.findMany({
        where: { googleDriveFolderLink: { connection: { workspaceId } }, ...(googleStatuses ? { status: { in: googleStatuses } } : {}), ...afterCursor('GOOGLE_SYNC', 'startedAt', cursor), ...dateRange('startedAt', from, to) },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], take,
        include: { googleDriveFolderLink: { select: { id: true, name: true, project: { select: { id: true, key: true, name: true } } } }, _count: { select: { items: true } } },
      }) : [],
      activityWhere && selectedActions.length ? this.prisma.activityLog.findMany({
        where: activityWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take,
        include: { user: { select: { name: true } } },
      }) : [],
      projectIdList.length && operationStatuses.length && (wantGithub || wantOpenProject) ? this.prisma.integrationTaskOperation.findMany({
        where: {
          status: { in: operationStatuses },
          requirement: { projectId: { in: projectIdList } },
          connection: { kind: { in: [ ...(wantGithub ? [IntegrationKind.GITHUB] : []), ...(wantOpenProject ? [IntegrationKind.OPENPROJECT] : []) ] } },
          ...afterCursor('TASK_OPERATION', 'updatedAt', cursor),
          ...dateRange('updatedAt', from, to),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take,
        include: { connection: { select: { kind: true } }, requirement: { select: { id: true, code: true, title: true, project: { select: { id: true, key: true, name: true } } } } },
      }) : [],
      (wantGithub || wantOpenProject) && (status === 'ALL' || status === 'COMPLETED') ? this.prisma.externalArtifactLink.findMany({
        where: { requirement: { projectId: { in: projectIdList } }, connection: { kind: { in: [ ...(wantGithub ? [IntegrationKind.GITHUB] : []), ...(wantOpenProject ? [IntegrationKind.OPENPROJECT] : []) ] } }, ...afterCursor('LEGACY_TASK', 'createdAt', cursor), ...dateRange('createdAt', from, to) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take,
        include: { connection: { select: { kind: true } }, requirement: { select: { id: true, code: true, title: true, project: { select: { id: true, key: true, name: true } } } } },
      }) : [],
    ]);

    const loggedTaskLinkIds = new Set(activities.filter(row => row.action.endsWith('_TASK_CREATED') || row.action.endsWith('_TASK_LINKED') && !row.action.endsWith('_TASK_PROJECT_LINKED')).map(row => row.entityId));
    const loggedOperationIds = new Set(activities.filter(row => row.action.endsWith('_TASK_FAILED') || row.action.endsWith('_TASK_UNKNOWN')).map(row => row.entityId));
    const items = [
      ...runs.map(run => ({
        id: `GOOGLE_SYNC:${run.id}`, source: 'GOOGLE_SYNC' as const, provider: 'GOOGLE' as const, action: 'SYNC', status: run.status,
        occurredAt: run.startedAt.toISOString(), title: run.googleDriveFolderLink.name,
        summary: `${run.changedCount} ${run.changedCount === 1 ? 'alteração' : 'alterações'} · ${run.scannedCount} ${run.scannedCount === 1 ? 'arquivo lido' : 'arquivos lidos'}`,
        error: run.error, project: run.googleDriveFolderLink.project, detailId: run.id, itemCount: run._count.items,
      })),
      ...activities.map(row => {
        const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
        const providerName = row.action.includes('_GITHUB_') ? 'GITHUB' as const : 'OPENPROJECT' as const;
        const action = row.action.endsWith('_TASK_CREATED') ? 'TASK_CREATED' : row.action.endsWith('_TASK_PROJECT_LINKED') ? 'PROJECT_LINKED' : row.action.endsWith('_TASK_LINKED') ? 'TASK_LINKED' : row.action.endsWith('_TASK_UNKNOWN') ? 'TASK_UNKNOWN' : row.action.endsWith('_TASK_PROJECT_FAILED') ? 'PROJECT_FAILED' : 'TASK_FAILED';
        const status = action === 'TASK_FAILED' || action === 'PROJECT_FAILED' ? 'FAILED' : action === 'TASK_UNKNOWN' ? 'UNKNOWN' : 'COMPLETED';
        return {
          id: `ACTIVITY:${row.id}`, source: 'ACTIVITY' as const, provider: providerName, action, status, occurredAt: row.createdAt.toISOString(),
          title: String(metadata.externalTitle ?? metadata.title ?? 'Tarefa externa'), summary: action === 'TASK_CREATED' ? 'Tarefa criada pelo ATHENA' : action === 'TASK_LINKED' ? 'Tarefa vinculada ao ATHENA' : action === 'PROJECT_LINKED' ? 'Tarefa adicionada ao GitHub Project' : action === 'TASK_UNKNOWN' ? 'Resultado da publicação não confirmado' : action === 'PROJECT_FAILED' ? 'Falha ao incluir no GitHub Project' : metadata.taskAction === 'LINK' ? 'Falha ao vincular tarefa existente' : 'Falha ao criar tarefa',
          error: typeof metadata.error === 'string' ? metadata.error : null, remoteId: typeof metadata.remoteId === 'string' ? metadata.remoteId : null,
          url: typeof metadata.url === 'string' ? metadata.url : null, remoteStatus: typeof metadata.remoteStatus === 'string' ? metadata.remoteStatus : null,
          projectTitle: typeof metadata.projectTitle === 'string' ? metadata.projectTitle : null,
          project: metadata.project && typeof metadata.project === 'object' ? metadata.project : null,
          requirement: metadata.requirement && typeof metadata.requirement === 'object' ? metadata.requirement : null,
          actor: row.user.name,
        };
      }),
      ...operations.filter(row => !loggedOperationIds.has(row.id)).map(row => ({
        id: `TASK_OPERATION:${row.id}`, source: 'TASK_OPERATION' as const, provider: row.connection.kind,
        action: 'TASK_ERROR', status: row.status, occurredAt: row.updatedAt.toISOString(), title: row.requirement.title,
        summary: row.status === 'FAILED' ? 'Falha ao criar tarefa' : row.status === 'UNKNOWN' ? 'Resultado da publicação não confirmado' : 'Publicação em andamento',
        error: row.errorCode, remoteId: row.remoteId, remoteStatus: null,
        project: row.requirement.project, requirement: { id: row.requirement.id, code: row.requirement.code, title: row.requirement.title }, actor: null,
      })),
      ...legacyLinks.filter(row => !loggedTaskLinkIds.has(row.id)).map(row => ({
        id: `LEGACY_TASK:${row.id}`, source: 'LEGACY_TASK' as const, provider: row.connection.kind, action: 'TASK_LINKED', status: 'COMPLETED',
        occurredAt: row.createdAt.toISOString(), title: row.title, summary: 'Tarefa vinculada ao ATHENA', error: null,
        remoteId: row.remoteId, url: row.url, remoteStatus: row.remoteStatus,
        project: row.requirement.project, requirement: { id: row.requirement.id, code: row.requirement.code, title: row.requirement.title }, actor: null,
      })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || sourceRank[a.source].valueOf() - sourceRank[b.source].valueOf() || b.id.localeCompare(a.id));
    const hasMore = runs.length === take || activities.length === take || operations.length === take || legacyLinks.length === take || items.length > take - 1;
    const page = items.slice(0, take - 1);
    const last = page.at(-1);
    const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ at: last.occurredAt, source: last.source, id: last.id.split(':').slice(1).join(':') })).toString('base64url') : null;
    return { items: page, nextCursor };
  }
}
