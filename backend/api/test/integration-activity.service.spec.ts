import { IntegrationActivityService } from '../src/integrations/integration-activity.service';

describe('IntegrationActivityService', () => {
  function setup() {
    const prisma: any = {
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ userId: 'member-1' }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      project: { findMany: jest.fn().mockResolvedValue([{ id: 'project-1' }, { id: 'project-2' }]) },
      googleDriveSyncRun: { findMany: jest.fn().mockResolvedValue([]) },
      activityLog: { findMany: jest.fn().mockResolvedValue([]) },
      integrationTaskOperation: { findMany: jest.fn().mockResolvedValue([]) },
      externalArtifactLink: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new IntegrationActivityService(prisma) };
  }

  it('merges Drive runs, task activities, and legacy links in descending time order', async () => {
    const { prisma, service } = setup();
    prisma.googleDriveSyncRun.findMany.mockResolvedValue([{
      id: 'run-1', status: 'FAILED', startedAt: new Date('2026-09-27T12:00:00.000Z'), changedCount: 0, scannedCount: 4, error: 'Drive indisponível', _count: { items: 0 },
      googleDriveFolderLink: { id: 'folder-1', name: 'Produto', project: { id: 'project-1', key: 'ATH', name: 'ATHENA' } },
    }]);
    prisma.activityLog.findMany.mockResolvedValue([{
      id: 'activity-1', action: 'INTEGRATION_GITHUB_TASK_CREATED', entityId: 'artifact-1', createdAt: new Date('2026-09-27T11:00:00.000Z'), user: { name: 'Ana' },
      metadata: { externalTitle: 'Issue nova', remoteId: '21', url: 'https://github.com/acme/repo/issues/21', requirement: { code: 'US-2', title: 'Publicar tarefa' } },
    }]);
    prisma.externalArtifactLink.findMany.mockResolvedValue([{
      id: 'artifact-1', createdAt: new Date('2026-09-27T11:00:01.000Z'), remoteId: '21', title: 'Issue nova', url: 'https://github.com/acme/repo/issues/21', remoteStatus: 'open',
      connection: { kind: 'GITHUB' }, requirement: { id: 'req-1', code: 'US-2', title: 'Publicar tarefa', project: { id: 'project-1', key: 'ATH', name: 'ATHENA' } },
    }, {
      id: 'artifact-2', createdAt: new Date('2026-09-27T10:00:00.000Z'), remoteId: '44', title: 'Pacote vinculado', url: 'https://openproject.example/work_packages/44', remoteStatus: 'Doing',
      connection: { kind: 'OPENPROJECT' }, requirement: { id: 'req-2', code: 'US-3', title: 'Implementar', project: { id: 'project-2', key: 'APP', name: 'Aplicação' } },
    }]);

    const result = await service.list('member-1', 'workspace-1');
    expect(result.items.map(item => [item.provider, item.title])).toEqual([['GOOGLE', 'Produto'], ['GITHUB', 'Issue nova'], ['OPENPROJECT', 'Pacote vinculado']]);
    expect(result.items[0]).toMatchObject({ status: 'FAILED', error: 'Drive indisponível' });
    expect(result.items[1]).toMatchObject({ action: 'TASK_CREATED', actor: 'Ana', remoteId: '21' });
    expect(result.items[2]).toMatchObject({ action: 'TASK_LINKED', requirement: { code: 'US-3' } });
  });

  it('applies provider filtering before reading the provider event tables', async () => {
    const { prisma, service } = setup();
    const page = await service.list('member-1', 'workspace-1', undefined, 20, 'GITHUB');
    expect(page.items).toEqual([]);
    expect(prisma.googleDriveSyncRun.findMany).not.toHaveBeenCalled();
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ action: { in: expect.arrayContaining(['INTEGRATION_GITHUB_TASK_CREATED']) } }) }));
    expect(prisma.externalArtifactLink.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ connection: { kind: { in: ['GITHUB'] } } }) }));
  });

  it('includes successful and failed GitHub Project actions in the task history', async () => {
    const { prisma, service } = setup();
    prisma.activityLog.findMany.mockResolvedValue([
      { id: 'failed', action: 'INTEGRATION_GITHUB_TASK_PROJECT_FAILED', entityId: 'link-2', createdAt: new Date('2026-09-27T12:02:00.000Z'), user: { name: 'Ana' }, metadata: { externalTitle: 'Issue 2', projectTitle: 'Roadmap', error: 'Project indisponível' } },
      { id: 'linked', action: 'INTEGRATION_GITHUB_TASK_PROJECT_LINKED', entityId: 'link-1', createdAt: new Date('2026-09-27T12:01:00.000Z'), user: { name: 'Ana' }, metadata: { externalTitle: 'Issue 1', projectTitle: 'Roadmap' } },
    ]);

    const result = await service.list('member-1', 'workspace-1');
    expect(result.items.map(item => [item.action, item.status, item.summary])).toEqual([
      ['PROJECT_FAILED', 'FAILED', 'Falha ao incluir no GitHub Project'],
      ['PROJECT_LINKED', 'COMPLETED', 'Tarefa adicionada ao GitHub Project'],
    ]);
    expect(result.items[0]).toMatchObject({ title: 'Issue 2', projectTitle: 'Roadmap', error: 'Project indisponível' });
  });

  it('applies date and status filters to every activity source before pagination', async () => {
    const { prisma, service } = setup();
    await service.list('member-1', 'workspace-1', undefined, 30, 'ALL', '2026-09-01T03:00:00.000Z', '2026-09-08T03:00:00.000Z', 'FAILED');

    expect(prisma.googleDriveSyncRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['FAILED'] }, startedAt: { gte: new Date('2026-09-01T03:00:00.000Z'), lt: new Date('2026-09-08T03:00:00.000Z') } }),
    }));
    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ action: { in: expect.arrayContaining(['INTEGRATION_GITHUB_TASK_FAILED', 'INTEGRATION_GITHUB_TASK_PROJECT_FAILED']) }, createdAt: { gte: new Date('2026-09-01T03:00:00.000Z'), lt: new Date('2026-09-08T03:00:00.000Z') } }),
    }));
    expect(prisma.integrationTaskOperation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['FAILED'] }, updatedAt: { gte: new Date('2026-09-01T03:00:00.000Z'), lt: new Date('2026-09-08T03:00:00.000Z') } }),
    }));
    expect(prisma.externalArtifactLink.findMany).not.toHaveBeenCalled();
  });
});
