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
});
