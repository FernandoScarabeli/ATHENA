import { RequirementsService } from '../src/requirements/requirements.service';

describe('RequirementsService.workspaces', () => {
  it('consulta memberships apenas do usuário autenticado e expõe os campos mínimos', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        role: 'OWNER',
        workspace: {
          id: 'workspace-1',
          name: 'Produto',
          projects: [{ id: 'project-1', name: 'ATHENA', key: 'ATH' }],
        },
      },
    ]);
    const prisma = { workspaceMember: { findMany } };
    const service = new RequirementsService(prisma as never);

    await expect(service.workspaces('user-1')).resolves.toEqual([
      {
        id: 'workspace-1',
        name: 'Produto',
        role: 'OWNER',
        projects: [{ id: 'project-1', name: 'ATHENA', key: 'ATH' }],
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
            projects: {
              select: { id: true, name: true, key: true },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });
  });
});

describe('RequirementsService RBAC', () => {
  it('não permite que viewer crie projeto', async () => {
    const findUnique = jest.fn().mockResolvedValue({ role: 'VIEWER' });
    const create = jest.fn();
    const requirementFolder = { findFirst: jest.fn().mockResolvedValue({ id: 'folder-1' }), create: jest.fn() };
    const service = new RequirementsService({ workspaceMember: { findUnique }, project: { create }, requirementFolder } as never);

    await expect(service.createProject('user-1', 'workspace-1', 'Novo', 'NVO')).rejects.toThrow('Você não tem permissão');
    expect(create).not.toHaveBeenCalled();
  });

  it('permite que owner crie projeto', async () => {
    const findUnique = jest.fn().mockResolvedValue({ role: 'OWNER' });
    const create = jest.fn().mockResolvedValue({ id: 'project-1', key: 'NVO' });
    const requirementFolder = { findFirst: jest.fn().mockResolvedValue({ id: 'folder-1' }), create: jest.fn() };
    const service = new RequirementsService({ workspaceMember: { findUnique }, project: { create }, requirementFolder } as never);

    await expect(service.createProject('user-1', 'workspace-1', 'Novo', 'nvo')).resolves.toEqual({ id: 'project-1', key: 'NVO' });
    expect(create).toHaveBeenCalledWith({ data: { workspaceId: 'workspace-1', name: 'Novo', key: 'NVO' } });
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
    const service = new RequirementsService(prisma as never);

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
    const service = new RequirementsService(prisma as never);

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
    const service = new RequirementsService(prisma as never);

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
    const service = new RequirementsService(prisma as never);

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

describe('RequirementsService references', () => {
  const dto = (url: string) => ({ type: 'PROTOTYPE', name: 'Referência', url } as never);

  it('blocks manual creation with a stable product error without touching persistence', async () => {
    const create = jest.fn();
    const service = new RequirementsService({ requirementReference: { create } } as never);

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
    const service = new RequirementsService({
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
      const service = new RequirementsService({
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
    const service = new RequirementsService({ workspaceMember, requirementFolder: { findFirst, create: jest.fn() } } as never);

    await expect(service.createFolder('editor', 'workspace', { name: '   ' })).rejects.toThrow('não pode ficar vazio');
    await expect(service.createFolder('editor', 'workspace', { name: '  Roadmap  ' })).rejects.toThrow('Já existe');
    expect(findFirst).toHaveBeenCalledWith({ where: { workspaceId: 'workspace', parentId: null, name: { equals: 'Roadmap', mode: 'insensitive' } } });
  });

  it('protects the reserved Sem pasta folder from rename and delete', async () => {
    const workspaceMember = { findUnique: member() };
    const findUnique = jest.fn().mockResolvedValue({ id: 'default', workspaceId: 'workspace', name: 'Sem pasta' });
    const service = new RequirementsService({ workspaceMember, requirementFolder: { findUnique }, $transaction: jest.fn() } as never);

    await expect(service.updateFolder('editor', 'default', { name: 'Organizadas' })).rejects.toThrow('reservada');
    await expect(service.deleteFolder('editor', 'default')).rejects.toThrow('não pode ser excluída');
  });

  it('moves every requirement in the workspace, including archived stories, before deleting a folder', async () => {
    const workspaceMember = { findUnique: member() };
    const findUnique = jest.fn().mockResolvedValue({ id: 'source', workspaceId: 'workspace', name: 'Antiga' });
    const fallback = jest.fn().mockResolvedValue({ id: 'default', name: 'Sem pasta' });
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const deleteFolder = jest.fn().mockResolvedValue({ id: 'source' });
    const tx = { requirementFolder: { findFirst: fallback, delete: deleteFolder }, requirement: { updateMany } };
    const transaction = jest.fn(async (work: (client: typeof tx) => unknown) => work(tx));
    const service = new RequirementsService({ workspaceMember, requirementFolder: { findUnique, count: jest.fn().mockResolvedValue(0) }, $transaction: transaction } as never);

    await expect(service.deleteFolder('editor', 'source')).resolves.toEqual({ ok: true });
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
    return new RequirementsService({
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
    const service = new RequirementsService({
      requirement: { findUnique: jest.fn()
        .mockResolvedValueOnce({ id: 'source', projectId: 'project', status: 'ACTIVE', archivedAt: null })
        .mockResolvedValueOnce({ id: 'target', projectId: 'project', status: 'ACTIVE', archivedAt: null }) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project', workspaceId: 'workspace' }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      requirementRelation: { findFirst: jest.fn().mockResolvedValue(null), create },
    } as never);

    await expect(service.relate('editor', 'source', { targetId: 'target', type: 'BLOCKS' } as never)).rejects.toThrow('já existe');
  });
});
