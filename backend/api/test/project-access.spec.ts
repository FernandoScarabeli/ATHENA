import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectRole, WorkspaceRole } from '@prisma/client';
import { effectiveProjectAccess, requireProjectAccess } from '../src/common/project-access';
import { PrismaService } from '../src/core/prisma.service';

describe('effective project access', () => {
  const project = { id: 'p1', workspaceId: 'w1' };
  const prisma = {
    project: { findUnique: jest.fn() },
    workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
    workspaceMember: { findUnique: jest.fn() },
    projectMember: { findUnique: jest.fn() },
  } as unknown as PrismaService;

  beforeEach(() => jest.clearAllMocks());

  it('uses the workspace role before a project role', async () => {
    jest.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
    jest.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({ workspaceId: 'w1', userId: 'u1', role: WorkspaceRole.VIEWER } as never);
    jest.mocked(prisma.projectMember.findUnique).mockResolvedValue({ projectId: 'p1', userId: 'u1', role: ProjectRole.EDITOR } as never);

    const access = await effectiveProjectAccess(prisma, 'u1', 'p1');

    expect(access).toMatchObject({ project, role: WorkspaceRole.VIEWER, scope: 'WORKSPACE' });
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
    await expect(requireProjectAccess(prisma, 'u1', 'p1', true)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('limits project-only access to the requested project and enforces Viewer read-only', async () => {
    jest.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
    jest.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);
    jest.mocked(prisma.projectMember.findUnique).mockResolvedValue({ projectId: 'p1', userId: 'u1', role: ProjectRole.VIEWER } as never);

    const access = await requireProjectAccess(prisma, 'u1', 'p1');
    expect(access.role).toBe(ProjectRole.VIEWER);
    await expect(requireProjectAccess(prisma, 'u1', 'p1', true)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({ where: { projectId_userId: { projectId: 'p1', userId: 'u1' } } });
  });

  it('gives workspace Managers project edit access but still treats them as Managers', async () => {
    jest.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
    jest.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({ workspaceId: 'w1', userId: 'u1', role: WorkspaceRole.MANAGER } as never);

    const access = await requireProjectAccess(prisma, 'u1', 'p1', true);

    expect(access).toMatchObject({ role: WorkspaceRole.MANAGER, scope: 'WORKSPACE' });
  });

  it('returns not found for a project id that does not exist', async () => {
    jest.mocked(prisma.project.findUnique).mockResolvedValue(null);
    await expect(effectiveProjectAccess(prisma, 'u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns not found for projects archived directly or through their workspace', async () => {
    jest.mocked(prisma.project.findUnique).mockResolvedValue({ ...project, archivedAt: new Date() } as never);
    await expect(effectiveProjectAccess(prisma, 'u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);

    jest.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
    jest.mocked(prisma.workspace.findUnique).mockResolvedValue({ archivedAt: new Date() } as never);
    await expect(effectiveProjectAccess(prisma, 'u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
