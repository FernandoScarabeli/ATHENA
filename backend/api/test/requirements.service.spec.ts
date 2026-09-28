import { RequirementsService } from '../src/requirements/requirements.service';
import { DEFAULT_REVIEW_CHECKLIST } from '../src/requirements/review-checklist.defaults';

function createService(prisma: any) {
  const activeWorkspace = () => ({ findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) });
  const transaction = prisma.$transaction;
  const client = {
    ...prisma,
    workspace: { ...activeWorkspace(), ...prisma.workspace },
    ...(transaction ? {
      $transaction: (work: any, options?: unknown) => transaction.call(prisma, Array.isArray(work)
        ? work
        : (tx: any) => work({ ...tx, workspace: { ...activeWorkspace(), ...tx.workspace } }), options),
    } : {}),
  };
  return new RequirementsService(client as never);
}

describe('RequirementsService.workspaces', () => {
  it('consulta memberships apenas do usuário autenticado e expõe os campos mínimos', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        role: 'OWNER',
        workspace: {
          id: 'workspace-1',
          name: 'Produto',
          archivedAt: null,
          projects: [{ id: 'project-1', name: 'ATHENA', key: 'ATH', archivedAt: null }],
        },
      },
    ]);
    const prisma = { workspaceMember: { findMany }, projectMember: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = createService(prisma as never);

    await expect(service.workspaces('user-1')).resolves.toEqual([
      {
        id: 'workspace-1',
        name: 'Produto',
        archivedAt: null,
        role: 'OWNER',
        projects: [{ id: 'project-1', name: 'ATHENA', key: 'ATH', archivedAt: null }],
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            archivedAt: true,
            projects: {
              where: { archivedAt: null },
              select: { id: true, name: true, key: true, archivedAt: true },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });
  });

  it('returns only project memberships when the user has no workspace membership', async () => {
    const prisma = {
      workspaceMember: { findMany: jest.fn().mockResolvedValue([]) },
      projectMember: { findMany: jest.fn().mockResolvedValue([{ role: 'EDITOR', project: { id: 'project-2', name: 'Portal', key: 'PORTAL', workspace: { id: 'workspace-2', name: 'Acme' } } }]) },
    };
    const service = createService(prisma as never);

    await expect(service.workspaces('user-2')).resolves.toEqual([{
      id: 'workspace-2', name: 'Acme', archivedAt: null, role: null,
      projects: [{ id: 'project-2', name: 'Portal', key: 'PORTAL', archivedAt: null, role: 'EDITOR' }],
    }]);
    expect(prisma.projectMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-2',
        project: expect.objectContaining({ workspace: expect.objectContaining({ members: { none: { userId: 'user-2' } } }) }),
      }),
    }));
  });
});

describe('workspace membership scope cleanup', () => {
  it('removes project grants when an Owner promotes a person to workspace access', async () => {
    const deleteProjectMemberships = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      workspaceMember: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { workspaceId_userId: { userId: string } } }) => Promise.resolve(where.workspaceId_userId.userId === 'owner' ? { role: 'OWNER' } : null)),
        upsert: jest.fn().mockResolvedValue({ role: 'EDITOR' }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'person', name: 'Pessoa', email: 'pessoa@example.com' }) },
      projectMember: { deleteMany: deleteProjectMemberships },
    };
    const prisma = { $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
    const service = createService(prisma as never);

    await service.addMember('owner', 'workspace-1', { email: 'pessoa@example.com', role: 'EDITOR' } as never);

    expect(deleteProjectMemberships).toHaveBeenCalledWith({ where: { userId: 'person', project: { workspaceId: 'workspace-1' } } });
  });

  it('removes every project grant when an Owner removes workspace access', async () => {
    const deleteProjectMemberships = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      workspaceMember: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { workspaceId_userId: { userId: string } } }) => Promise.resolve(where.workspaceId_userId.userId === 'owner' ? { role: 'OWNER' } : { role: 'EDITOR' })),
        delete: jest.fn().mockResolvedValue({ userId: 'person' }),
      },
      projectMember: { deleteMany: deleteProjectMemberships },
    };
    const prisma = { $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
    const service = createService(prisma as never);

    await service.removeMember('owner', 'workspace-1', 'person');

    expect(deleteProjectMemberships).toHaveBeenCalledWith({ where: { userId: 'person', project: { workspaceId: 'workspace-1' } } });
  });
});

describe('RequirementsService RBAC', () => {
  it('filters project mentions by current access and access-request notices by current Owner or Manager role', async () => {
    const rows = [
      { id: 'owned-request', type: 'ACCESS_REQUEST', accessRequest: { workspaceId: 'w1' } },
      { id: 'old-owner-request', type: 'ACCESS_REQUEST', accessRequest: { workspaceId: 'w2' } },
      { id: 'own-decision', type: 'ACCESS_DECISION', accessRequest: { workspaceId: 'w2' } },
      { id: 'visible-mention', type: 'MENTION', commentMessage: { thread: { requirement: { projectId: 'p1' } } } },
      { id: 'hidden-mention', type: 'MENTION', commentMessage: { thread: { requirement: { projectId: 'p2' } } } },
    ];
    const service = createService({
      project: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }]) },
      workspaceMember: { findMany: jest.fn().mockResolvedValue([{ workspaceId: 'w1' }]) },
      notification: { findMany: jest.fn().mockResolvedValue(rows) },
    } as never);

    await expect(service.notifications('user-1')).resolves.toEqual([
      rows[0], rows[2], rows[3],
    ]);
    expect((service as any).prisma.workspaceMember.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', role: { in: ['OWNER', 'MANAGER'] } },
      select: { workspaceId: true },
    });
  });

  it('lets Managers edit project content while keeping workspace settings Owner-only', async () => {
    const createdRequirement = { id: 'requirement-1', projectId: 'project-1' };
    const manager = { role: 'MANAGER', workspace: { archivedAt: null } };
    const tx = {
      project: { update: jest.fn().mockResolvedValue({ requirementSequence: 1 }) },
      requirement: { create: jest.fn().mockResolvedValue(createdRequirement) },
      activityLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const workspaceUpdate = jest.fn();
    const prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1', archivedAt: null }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }), update: workspaceUpdate },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(manager) },
      projectMember: { findUnique: jest.fn().mockResolvedValue(null) },
      requirementFolder: { findFirst: jest.fn().mockResolvedValue({ id: 'folder-1' }) },
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const service = createService(prisma as never);

    await expect(service.create('manager-1', 'project-1', { title: 'Nova US', folderId: 'folder-1' } as never)).resolves.toEqual(createdRequirement);
    await expect(service.updateReviewChecklist('manager-1', 'workspace-1', { items: ['Revisar'] } as never)).rejects.toMatchObject({ status: 403 });
    await expect(service.createTemplate('manager-1', 'workspace-1', { name: 'Padrão' } as never)).rejects.toMatchObject({ status: 403 });
    expect(workspaceUpdate).not.toHaveBeenCalled();
  });

  it('lets a Manager resolve comments on their workspace projects', async () => {
    const thread = { authorId: 'another-user', requirement: { projectId: 'project-1', status: 'ACTIVE', archivedAt: null } };
    const updated = { id: 'thread-1', status: 'RESOLVED' };
    const prisma = {
      commentThread: { findUnique: jest.fn().mockResolvedValue(thread), update: jest.fn().mockResolvedValue(updated) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1', archivedAt: null }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'MANAGER' }) },
      projectMember: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = createService(prisma as never);

    await expect(service.setCommentResolution('manager-1', 'thread-1', true)).resolves.toEqual(updated);
    expect(prisma.commentThread.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'thread-1' }, data: expect.objectContaining({ status: 'RESOLVED' }) }));
  });

  it('não permite que viewer crie projeto', async () => {
    const findUnique = jest.fn().mockResolvedValue({ role: 'VIEWER' });
    const create = jest.fn();
    const requirementFolder = { findFirst: jest.fn().mockResolvedValue({ id: 'folder-1' }), create: jest.fn() };
    const service = createService({ workspaceMember: { findUnique }, project: { create }, requirementFolder } as never);

    await expect(service.createProject('user-1', 'workspace-1', 'Novo', 'NVO')).rejects.toThrow('Você não tem permissão');
    expect(create).not.toHaveBeenCalled();
  });

  it('permite que owner crie projeto', async () => {
    const findUnique = jest.fn().mockResolvedValue({ role: 'OWNER' });
    const create = jest.fn().mockResolvedValue({ id: 'project-1', key: 'NVO' });
    const requirementFolder = { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'default-folder' }) };
    const tx = { project: { findFirst: jest.fn().mockResolvedValue(null), create }, requirementFolder };
    const service = createService({ workspaceMember: { findUnique }, $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) } as never);

    await expect(service.createProject('user-1', 'workspace-1', 'Novo', 'nvo')).resolves.toEqual({ id: 'project-1', key: 'NVO' });
    expect(create).toHaveBeenCalledWith({ data: { workspaceId: 'workspace-1', name: 'Novo', key: 'NVO' } });
    expect(requirementFolder.create).toHaveBeenCalledWith({ data: { workspaceId: 'workspace-1', projectId: 'project-1', name: 'Sem pasta', description: 'Requisitos ainda não classificados' } });
  });

  it('copia a árvore legada para o primeiro projeto antes de remover a árvore de transição', async () => {
    const legacy = [
      { id: 'legacy-root', workspaceId: 'workspace-1', projectId: null, name: 'Sem pasta', description: 'Padrão', parentId: null, createdAt: new Date(1) },
      { id: 'legacy-child', workspaceId: 'workspace-1', projectId: null, name: 'Produto', description: 'Área', parentId: 'legacy-root', createdAt: new Date(2) },
    ];
    const createProject = jest.fn().mockResolvedValue({ id: 'project-1', key: 'NVO' });
    const createFolder = jest.fn(async ({ data }: { data: { name: string } }) => ({ id: `copy-${data.name}` }));
    let cleanupPass = 0;
    const findFolders = jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.children) return (cleanupPass++ === 0 ? [{ id: 'legacy-child' }, { id: 'legacy-root' }] : []) as never;
      if (where.projectId === null) return legacy as never;
      return [] as never;
    });
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      project: { findFirst: jest.fn().mockResolvedValue(null), create: createProject },
      requirementFolder: { findMany: findFolders, create: createFolder, deleteMany },
    };
    const service = createService({
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    } as never);

    await service.createProject('owner', 'workspace-1', 'Novo', 'NVO');

    expect(createFolder).toHaveBeenCalledWith({ data: { workspaceId: 'workspace-1', projectId: 'project-1', name: 'Sem pasta', description: 'Padrão', parentId: null } });
    expect(createFolder).toHaveBeenCalledWith({ data: { workspaceId: 'workspace-1', projectId: 'project-1', name: 'Produto', description: 'Área', parentId: 'copy-Sem pasta' } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['legacy-child', 'legacy-root'] } } });
  });

  it('não permite rebaixar o último owner ao reutilizar um convite', async () => {
    const actor = jest.fn().mockResolvedValue({ role: 'OWNER' });
    const target = jest.fn()
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'OWNER' });
    const count = jest.fn().mockResolvedValue(1);
    const upsert = jest.fn();
    const tx = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-2', name: 'Outro', email: 'outro@example.com' }) }, workspaceMember: { findUnique: target, count, upsert } };
    const prisma = {
      workspaceMember: { findUnique: actor },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-2', name: 'Outro', email: 'outro@example.com' }) },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = createService(prisma as never);

    await expect(service.addMember('user-1', 'workspace-1', { email: 'outro@example.com', role: 'VIEWER' } as never))
      .rejects.toThrow('ao menos um owner');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('protege a remoção do último owner dentro da transação', async () => {
    const actor = jest.fn().mockResolvedValue({ role: 'OWNER' });
    const target = jest.fn()
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'OWNER' });
    const count = jest.fn().mockResolvedValue(1);
    const del = jest.fn();
    const tx = { workspaceMember: { findUnique: target, count, delete: del } };
    const prisma = {
      workspaceMember: { findUnique: actor },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = createService(prisma as never);

    await expect(service.removeMember('user-1', 'workspace-1', 'user-2')).rejects.toThrow('ao menos um owner');
    expect(del).not.toHaveBeenCalled();
  });

  it('revalida o papel do ator dentro da transação administrativa', async () => {
    const target = jest.fn();
    const tx = {
      workspaceMember: {
        findUnique: jest.fn().mockResolvedValue({ role: 'VIEWER' }),
        update: target,
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = createService(prisma as never);

    await expect(service.updateMember('user-1', 'workspace-1', 'user-2', { role: 'EDITOR' } as never))
      .rejects.toThrow('Você não tem permissão');
    expect(target).not.toHaveBeenCalled();
  });

  it('inclui a revisão atual quando uma atualização perde a corrida otimista', async () => {
    const prisma = {
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'req-1', projectId: 'project-1', revision: 3, status: 'ACTIVE', archivedAt: null }) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      $transaction: jest.fn(async (work: (client: unknown) => unknown) => work({
        requirement: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findUnique: jest.fn().mockResolvedValue({ revision: 4 }),
        },
      })),
    };
    const service = createService(prisma as never);

    let caught: any;
    try {
      await service.update('user-1', 'req-1', { revision: 3, title: 'novo' });
    } catch (error: any) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(caught.getResponse()).toMatchObject({
      code: 'REQUIREMENT_REVISION_CONFLICT',
      details: { currentRevision: 4 },
    });
  });
});

describe('RequirementsService workspace review checklist', () => {
  it('initializes new workspaces with the editable checklist defaults', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'workspace-1' });
    const service = createService({ workspace: { create } } as never);

    await service.workspace('user-1', 'Produto');

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ reviewChecklist: [...DEFAULT_REVIEW_CHECKLIST] }) });
  });

  it('returns the checklist to workspace readers', async () => {
    const findUnique = jest.fn().mockResolvedValue({ reviewChecklist: ['Revisar exemplos', 'Conferir links'] });
    const service = createService({
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'VIEWER' }) },
      workspace: { findUnique },
    } as never);

    await expect(service.reviewChecklist('reader', 'workspace-1')).resolves.toEqual({ items: ['Revisar exemplos', 'Conferir links'] });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'workspace-1' }, select: { reviewChecklist: true } });
  });

  it('does not allow Editors to change workspace checklist items', async () => {
    const update = jest.fn().mockResolvedValue({ reviewChecklist: ['Segundo', 'Primeiro'] });
    const service = createService({
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      workspace: { update },
    } as never);

    await expect(service.updateReviewChecklist('editor', 'workspace-1', { items: [' Segundo ', 'Primeiro'] }))
      .rejects.toThrow('Você não tem permissão');
    expect(update).not.toHaveBeenCalled();
  });

  it('allows Owners to replace and reorder checklist items', async () => {
    const update = jest.fn().mockResolvedValue({ reviewChecklist: ['Segundo', 'Primeiro'] });
    const service = createService({
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      workspace: { update },
    } as never);

    await expect(service.updateReviewChecklist('owner', 'workspace-1', { items: [' Segundo ', 'Primeiro'] }))
      .resolves.toEqual({ items: ['Segundo', 'Primeiro'] });
    expect(update).toHaveBeenCalledWith({ where: { id: 'workspace-1' }, data: { reviewChecklist: ['Segundo', 'Primeiro'] }, select: { reviewChecklist: true } });
  });

  it('does not let viewers change the checklist', async () => {
    const update = jest.fn();
    const service = createService({
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'VIEWER' }) },
      workspace: { update },
    } as never);

    await expect(service.updateReviewChecklist('reader', 'workspace-1', { items: ['Novo item'] })).rejects.toThrow('Você não tem permissão');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('RequirementsService references', () => {
  const dto = (url: string) => ({ type: 'PROTOTYPE', name: 'Referência', url } as never);

  it('blocks manual creation with a stable product error without touching persistence', async () => {
    const create = jest.fn();
    const service = createService({ requirementReference: { create } } as never);

    await expect(service.createReference('user-1', 'requirement-1', dto('https://example.test')))
      .rejects.toMatchObject({ response: { code: 'MANUAL_REFERENCE_CREATION_DISABLED' } });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    'http://example.test/prototype',
    'https://example.test/prototype',
    'mailto:product@example.test',
  ])('accepts %s through the internal approval path', async (url) => {
    const create = jest.fn().mockResolvedValue({ id: 'reference-1', requirementId: 'requirement-1', url });
    const service = createService({
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'requirement-1', projectId: 'project-1' }) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      requirementReference: { create },
    } as never);

    await expect(service.approveReference('user-1', 'requirement-1', dto(url))).resolves.toMatchObject({ url });
    expect(create).toHaveBeenCalled();
  });

  it.each(['javascript:alert(1)', 'data:text/html,<p>unsafe</p>', 'ftp://example.test/file', 'https://'])
    ('rejects unsafe or malformed URL %s', async (url) => {
      const create = jest.fn();
      const service = createService({
        requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'requirement-1', projectId: 'project-1' }) },
        project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }) },
        workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
        requirementReference: { create },
      } as never);

      await expect(service.approveReference('user-1', 'requirement-1', dto(url))).rejects.toThrow('http, https ou mailto');
      expect(create).not.toHaveBeenCalled();
    });
});

describe('RequirementsService folder management', () => {
  const member = (role = 'EDITOR') => jest.fn().mockResolvedValue({ role });

  it('rejects blank and duplicate folder names with actionable errors', async () => {
    const workspaceMember = { findUnique: member() };
    const findFirst = jest.fn().mockResolvedValue({ id: 'existing' });
    const service = createService({ workspaceMember, project: { findUnique: jest.fn().mockResolvedValue({ id: 'project', workspaceId: 'workspace' }) }, requirementFolder: { findFirst, create: jest.fn() } } as never);

    await expect(service.createFolder('editor', 'project', { name: '   ' })).rejects.toThrow('não pode ficar vazio');
    await expect(service.createFolder('editor', 'project', { name: '  Roadmap  ' })).rejects.toThrow('Já existe');
    expect(findFirst).toHaveBeenCalledWith({ where: { projectId: 'project', parentId: null, name: { equals: 'Roadmap', mode: 'insensitive' } } });
  });

  it('protects the reserved Sem pasta folder from rename and delete', async () => {
    const workspaceMember = { findUnique: member() };
    const findFirst = jest.fn().mockResolvedValue({ id: 'default', workspaceId: 'workspace', projectId: 'project', name: 'Sem pasta' });
    const service = createService({ workspaceMember, project: { findUnique: jest.fn().mockResolvedValue({ id: 'project', workspaceId: 'workspace' }) }, requirementFolder: { findFirst }, $transaction: jest.fn() } as never);

    await expect(service.updateFolder('editor', 'project', 'default', { name: 'Organizadas' })).rejects.toThrow('reservada');
    await expect(service.deleteFolder('editor', 'project', 'default')).rejects.toThrow('não pode ser excluída');
  });

  it('moves every requirement in the project, including archived stories, before deleting a folder', async () => {
    const workspaceMember = { findUnique: member() };
    const findFirst = jest.fn().mockResolvedValue({ id: 'source', workspaceId: 'workspace', projectId: 'project', name: 'Antiga' });
    const fallback = jest.fn().mockResolvedValue({ id: 'default', name: 'Sem pasta' });
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const deleteFolder = jest.fn().mockResolvedValue({ id: 'source' });
    const tx = { requirementFolder: { findFirst: fallback, delete: deleteFolder }, requirement: { updateMany } };
    const transaction = jest.fn(async (work: (client: typeof tx) => unknown) => work(tx));
    const service = createService({ workspaceMember, project: { findUnique: jest.fn().mockResolvedValue({ id: 'project', workspaceId: 'workspace' }) }, requirement: { findMany: jest.fn().mockResolvedValue([]) }, googleDriveFolderMapping: { findMany: jest.fn().mockResolvedValue([]) }, googleDriveOutbox: { findMany: jest.fn().mockResolvedValue([]) }, requirementFolder: { findFirst, count: jest.fn().mockResolvedValue(0) }, $transaction: transaction } as never);

    await expect(service.deleteFolder('editor', 'project', 'source')).resolves.toEqual({ ok: true });
    expect(updateMany).toHaveBeenCalledWith({ where: { folderId: 'source' }, data: { folderId: 'default' } });
    expect(deleteFolder).toHaveBeenCalledWith({ where: { id: 'source' } });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('RequirementsService version history', () => {
  const requirement = {
    id: 'req-1', projectId: 'project-1', revision: 3, title: 'Atual',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'novo' }] }] },
    folderId: 'folder-new', status: 'ACTIVE', criteria: [{ text: 'A', title: null, given: null, whenText: null, thenText: null, content: null, position: 0 }],
    archivedAt: null, updatedAt: new Date('2026-01-03T00:00:00Z'),
  };
  function serviceWith(versions: unknown[]) {
    return createService({
      requirement: { findUnique: jest.fn().mockResolvedValue(requirement) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'VIEWER' }) },
      requirementVersion: { findMany: jest.fn().mockResolvedValue(versions) },
    } as never);
  }

  it('expõe a revisão corrente junto aos snapshots reais, sem criar snapshot persistido', async () => {
    const service = serviceWith([{ id: 'v1', requirementId: 'req-1', revision: 2, snapshot: { revision: 2, title: 'Anterior', content: {}, folderId: 'folder-old', status: 'ACTIVE', criteria: [] }, createdAt: new Date('2026-01-02T00:00:00Z') }]);
    await expect(service.versions('viewer', 'req-1')).resolves.toEqual([
      expect.objectContaining({ id: null, revision: 3, current: true, snapshot: expect.objectContaining({ title: 'Atual', folderId: 'folder-new', criteria: expect.any(Array) }) }),
      expect.objectContaining({ id: 'v1', revision: 2, current: false }),
    ]);
  });

  it('compara a revisão corrente e diferencia critérios adicionados/removidos', async () => {
    const service = serviceWith([{ id: 'v1', requirementId: 'req-1', revision: 2, snapshot: { revision: 2, title: 'Anterior', content: {}, folderId: 'folder-old', status: 'ACTIVE', criteria: [{ text: 'Remover', title: null, given: null, whenText: null, thenText: null, content: null, position: 0 }] } }]);
    await expect(service.diff('viewer', 'req-1', 2, 3)).resolves.toMatchObject({
      changedFields: ['title', 'content', 'folderId'],
      criteriaAdded: ['A'],
      criteriaRemoved: ['Remover'],
      changes: { title: { from: 'Anterior', to: 'Atual' }, folder: { from: 'folder-old', to: 'folder-new' } },
    });
  });

  it('rejeita revisão que não pertence ao requisito autorizado', async () => {
    const service = serviceWith([]);
    await expect(service.diff('viewer', 'req-1', 1, 99)).rejects.toThrow('Versão não encontrada');
  });
});

describe('RequirementsService relations', () => {
  it('converte duplicata concorrente em conflito estável', async () => {
    const create = jest.fn().mockRejectedValue({ code: 'P2002' });
    const transaction = { $queryRaw: jest.fn().mockResolvedValue([]), requirementRelation: { findFirst: jest.fn().mockResolvedValue(null), create } };
    const service = createService({
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'source', projectId: 'project', status: 'ACTIVE', archivedAt: null }) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project', workspaceId: 'workspace' }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      $transaction: jest.fn((callback) => callback(transaction)),
    } as never);

    await expect(service.relate('editor', 'source', { targetId: 'target', type: 'BLOCKS' } as never)).rejects.toThrow('já existe');
  });

  it('rejeita outro fluxo para o mesmo par mesmo com tipo e sentido diferentes', async () => {
    const create = jest.fn();
    const transaction = { $queryRaw: jest.fn().mockResolvedValue([]), requirementRelation: { findFirst: jest.fn().mockResolvedValue({ id: 'old', sourceId: 'target', targetId: 'source', type: 'DEPENDS_ON' }), create } };
    const service = createService({
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'source', projectId: 'project', status: 'ACTIVE', archivedAt: null }) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project', workspaceId: 'workspace' }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      $transaction: jest.fn((callback) => callback(transaction)),
    } as never);

    await expect(service.relate('editor', 'source', { targetId: 'target', type: 'BLOCKS' } as never)).rejects.toMatchObject({ status: 409 });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.requirementRelation.findFirst).toHaveBeenCalledWith({ where: { OR: [
      { sourceId: 'source', targetId: 'target' }, { sourceId: 'target', targetId: 'source' },
    ] } });
    expect(create).not.toHaveBeenCalled();
  });

  it('updates the type of a relation attached to the authorized requirement', async () => {
    const relation = { id: 'relation-1', sourceId: 'source', targetId: 'target', type: 'DEPENDS_ON' };
    const update = jest.fn().mockResolvedValue({ ...relation, type: 'BLOCKS', source: {}, target: {} });
    const service = createService({
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'source', projectId: 'project', status: 'ACTIVE' }) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project', workspaceId: 'workspace' }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      requirementRelation: { findFirst: jest.fn().mockResolvedValue(relation), update },
    } as never);

    await expect(service.updateRelation('editor', 'source', 'relation-1', { type: 'BLOCKS' } as never)).resolves.toMatchObject({ type: 'BLOCKS' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'relation-1' }, data: { sourceId: 'source', targetId: 'target', type: 'BLOCKS' }, include: { source: true, target: true } });
  });

  it('rejects a type update that would duplicate another relation', async () => {
    const update = jest.fn().mockRejectedValue({ code: 'P2002' });
    const service = createService({
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'source', projectId: 'project', status: 'ACTIVE' }) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project', workspaceId: 'workspace' }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      requirementRelation: { findFirst: jest.fn().mockResolvedValue({ id: 'relation-1', sourceId: 'source', targetId: 'target', type: 'DEPENDS_ON' }), update },
    } as never);

    await expect(service.updateRelation('editor', 'source', 'relation-1', { type: 'BLOCKS' } as never)).rejects.toThrow('Esta relação já existe com esse tipo');
  });

  it('does not update a relation outside the route requirement', async () => {
    const update = jest.fn();
    const service = createService({
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'source', projectId: 'project', status: 'ACTIVE' }) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project', workspaceId: 'workspace' }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      requirementRelation: { findFirst: jest.fn().mockResolvedValue(null), update },
    } as never);

    await expect(service.updateRelation('editor', 'source', 'unrelated-relation', { type: 'BLOCKS' } as never)).rejects.toThrow('Relação não encontrada');
    expect(update).not.toHaveBeenCalled();
  });

  it('requires editor membership before updating a relation', async () => {
    const update = jest.fn();
    const service = createService({
      requirement: { findUnique: jest.fn().mockResolvedValue({ id: 'source', projectId: 'project', status: 'ACTIVE' }) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project', workspaceId: 'workspace' }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'VIEWER' }) },
      requirementRelation: { findFirst: jest.fn(), update },
    } as never);

    await expect(service.updateRelation('viewer', 'source', 'relation-1', { type: 'BLOCKS' } as never)).rejects.toThrow('Você não tem permissão');
    expect(update).not.toHaveBeenCalled();
  });
});
