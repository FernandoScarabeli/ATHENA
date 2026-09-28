import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AccessScope, AccessRequestStatus, ProjectRole, WorkspaceRole } from '@prisma/client';
import { AccessService } from '../src/requirements/access.service';
import { PrismaService } from '../src/core/prisma.service';
import { TransactionalEmailService } from '../src/auth/transactional-email.service';

describe('access request decisions', () => {
  const request = {
    id: 'r1',
    projectId: 'p1',
    workspaceId: 'w1',
    requesterId: 'u2',
    status: AccessRequestStatus.PENDING,
    requester: { id: 'u2', name: 'Taylor', email: 'taylor@example.com' },
    project: { id: 'p1', name: 'Portal', key: 'PORTAL' },
    workspace: { id: 'w1', name: 'Acme' },
  };
  const mail = { sendAccessRequestDecision: jest.fn().mockResolvedValue(undefined) } as unknown as TransactionalEmailService;

  beforeEach(() => jest.clearAllMocks());

  it('creates one pending request and notifies every Owner and Manager', async () => {
    const created = { ...request, requester: request.requester };
    const tx = {
      accessRequest: { create: jest.fn().mockResolvedValue(created) },
      workspaceMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'owner-1' }, { userId: 'manager-1' }]) },
      notification: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', workspaceId: 'w1', name: 'Portal', workspace: { name: 'Acme' } }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(null) },
      projectMember: { findUnique: jest.fn().mockResolvedValue(null) },
      accessRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ email: `${where.id}@example.com` })) },
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaService;
    const mailer = { sendAccessRequestNotice: jest.fn().mockResolvedValue(undefined) } as unknown as TransactionalEmailService;
    const service = new AccessService(prisma, mailer);

    const result = await service.requestProjectAccess('u2', 'p1');

    expect(result.status).toBe(AccessRequestStatus.PENDING);
    expect(tx.notification.createMany).toHaveBeenCalledWith({ data: [
      { userId: 'owner-1', type: 'ACCESS_REQUEST', accessRequestId: 'r1' },
      { userId: 'manager-1', type: 'ACCESS_REQUEST', accessRequestId: 'r1' },
    ] });
    expect(mailer.sendAccessRequestNotice).toHaveBeenCalledTimes(2);
  });

  it('returns an existing pending request without sending duplicate notices', async () => {
    const notice = { sendAccessRequestNotice: jest.fn() } as unknown as TransactionalEmailService;
    const prisma = {
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', workspaceId: 'w1' }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(null) },
      projectMember: { findUnique: jest.fn().mockResolvedValue(null) },
      accessRequest: { findFirst: jest.fn().mockResolvedValue(request) },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new AccessService(prisma, notice);

    const result = await service.requestProjectAccess('u2', 'p1');

    expect(result).toEqual({ status: AccessRequestStatus.PENDING, request });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notice.sendAccessRequestNotice).not.toHaveBeenCalled();
  });

  it('grants the explicit workspace role and removes redundant project access', async () => {
    const decided = { ...request, status: AccessRequestStatus.APPROVED, scope: AccessScope.WORKSPACE, role: ProjectRole.EDITOR };
    const tx = {
      accessRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue(decided) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
      projectMember: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      notification: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      accessRequest: { findUnique: jest.fn().mockResolvedValue(request) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', workspaceId: 'w1', archivedAt: null }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: WorkspaceRole.OWNER, workspace: { archivedAt: null } }) },
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaService;
    const service = new AccessService(prisma, mail);

    const result = await service.decide('owner', 'r1', true, AccessScope.WORKSPACE, ProjectRole.EDITOR);

    expect(result.status).toBe(AccessRequestStatus.APPROVED);
    expect(tx.workspaceMember.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { workspaceId: 'w1', userId: 'u2', role: WorkspaceRole.EDITOR },
      update: { role: WorkspaceRole.EDITOR },
    }));
    expect(tx.projectMember.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u2', project: { workspaceId: 'w1' } } });
    expect(tx.notification.create).toHaveBeenCalledWith({ data: { userId: 'u2', type: 'ACCESS_DECISION', accessRequestId: 'r1' } });
    expect(mail.sendAccessRequestDecision).toHaveBeenCalledWith('taylor@example.com', 'Portal', 'Acme', 'p1', 'APPROVED', AccessScope.WORKSPACE, ProjectRole.EDITOR, 'r1');
  });

  it('does not overwrite a decision already made by another Owner', async () => {
    const tx = {
      accessRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      workspaceMember: { findUnique: jest.fn() },
      projectMember: { upsert: jest.fn() },
      notification: { create: jest.fn() },
    };
    const prisma = {
      accessRequest: { findUnique: jest.fn().mockResolvedValue(request) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', workspaceId: 'w1', archivedAt: null }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: WorkspaceRole.OWNER, workspace: { archivedAt: null } }) },
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaService;
    const service = new AccessService(prisma, mail);

    await expect(service.decide('owner', 'r1', false)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(mail.sendAccessRequestDecision).not.toHaveBeenCalled();
  });

  it('allows Managers to grant direct project access but rejects workspace scope', async () => {
    const decided = { ...request, status: AccessRequestStatus.APPROVED, scope: AccessScope.PROJECT, role: ProjectRole.EDITOR };
    const tx = {
      accessRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue(decided) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue(null) },
      projectMember: { upsert: jest.fn().mockResolvedValue({}) },
      notification: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      accessRequest: { findUnique: jest.fn().mockResolvedValue(request) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', workspaceId: 'w1', archivedAt: null }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: WorkspaceRole.MANAGER, workspace: { archivedAt: null } }) },
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    } as unknown as PrismaService;
    const service = new AccessService(prisma, mail);

    await expect(service.decide('manager', 'r1', true, AccessScope.WORKSPACE, ProjectRole.EDITOR)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await expect(service.decide('manager', 'r1', true, AccessScope.PROJECT, ProjectRole.EDITOR)).resolves.toMatchObject({ scope: AccessScope.PROJECT });
    expect(tx.projectMember.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { projectId: 'p1', userId: 'u2', role: ProjectRole.EDITOR } }));
  });
});
