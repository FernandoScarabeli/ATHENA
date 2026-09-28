import { ForbiddenException } from '@nestjs/common';
import { ProjectRole, WorkspaceRole } from '@prisma/client';
import { InviteService } from '../src/auth/invite.service';

describe('InviteService access acceptance', () => {
  it('grants a project invitation only to the matching verified account email', async () => {
    const invite = { id: 'invite-1', projectId: 'p1', email: 'person@example.com', role: ProjectRole.EDITOR, acceptedAt: null, project: { workspaceId: 'w1' } };
    const tx = {
      projectInvite: { findFirst: jest.fn().mockResolvedValue(invite), update: jest.fn().mockResolvedValue({}) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(null) },
      projectMember: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      workspaceInvite: { findFirst: jest.fn().mockResolvedValue(null) },
      projectInvite: { findFirst: jest.fn().mockResolvedValue(invite) },
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const service = new InviteService(prisma, {} as any);

    await expect(service.accept('u1', 'PERSON@example.com', 'token')).resolves.toEqual({ workspaceId: 'w1', projectId: 'p1', ok: true });
    expect(tx.projectMember.upsert).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'p1', userId: 'u1' } },
      create: { projectId: 'p1', userId: 'u1', role: ProjectRole.EDITOR },
      update: { role: ProjectRole.EDITOR },
    });
  });

  it('rejects a project invite accepted from a different account email', async () => {
    const invite = { id: 'invite-1', projectId: 'p1', email: 'person@example.com', role: ProjectRole.VIEWER, acceptedAt: null, project: { workspaceId: 'w1' } };
    const prisma: any = {
      workspaceInvite: { findFirst: jest.fn().mockResolvedValue(null) },
      projectInvite: { findFirst: jest.fn().mockResolvedValue(invite) },
      $transaction: jest.fn(),
    };
    const service = new InviteService(prisma, {} as any);

    await expect(service.accept('u2', 'someone-else@example.com', 'token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets Managers invite direct project Editors and Viewers but not workspace members', async () => {
    const manager = { role: WorkspaceRole.MANAGER };
    const invite = { id: 'project-invite-1', role: ProjectRole.EDITOR, expiresAt: new Date() };
    const tx = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', name: 'Portal', workspaceId: 'w1', archivedAt: null }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(manager), findFirst: jest.fn().mockResolvedValue(null) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      projectMember: { findFirst: jest.fn().mockResolvedValue(null) },
      projectInvite: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), create: jest.fn().mockResolvedValue(invite) },
      workspaceInvite: { create: jest.fn() },
    };
    const prisma: any = {
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ ...manager, workspace: { archivedAt: null } }) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', workspaceId: 'w1', archivedAt: null }) },
      projectInvite: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const mail = { sendProjectInvite: jest.fn().mockResolvedValue(undefined), sendWorkspaceInvite: jest.fn() };
    const service = new InviteService(prisma, mail as never);

    await expect(service.createProject('manager', 'p1', 'person@example.com', ProjectRole.EDITOR)).resolves.toMatchObject({ role: ProjectRole.EDITOR });
    expect(mail.sendProjectInvite).toHaveBeenCalledTimes(1);
    await expect(service.create('manager', 'w1', 'person@example.com', WorkspaceRole.MANAGER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.workspaceInvite.create).not.toHaveBeenCalled();
  });

  it('promotes workspace invitees and removes redundant project grants', async () => {
    const invite = { id: 'invite-2', workspaceId: 'w1', email: 'person@example.com', role: WorkspaceRole.VIEWER, acceptedAt: null };
    const deleteProjectMemberships = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      workspaceInvite: { findFirst: jest.fn().mockResolvedValue(invite), update: jest.fn().mockResolvedValue({}) },
      workspaceMember: { upsert: jest.fn().mockResolvedValue({}) },
      projectMember: { deleteMany: deleteProjectMemberships },
    };
    const prisma: any = {
      workspaceInvite: { findFirst: jest.fn().mockResolvedValue(invite) },
      projectInvite: { findFirst: jest.fn() },
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const service = new InviteService(prisma, {} as any);

    await expect(service.accept('u1', 'person@example.com', 'token')).resolves.toEqual({ workspaceId: 'w1', ok: true });
    expect(deleteProjectMemberships).toHaveBeenCalledWith({ where: { userId: 'u1', project: { workspaceId: 'w1' } } });
  });
});
