import { ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ExternalTasksService } from '../src/integrations/external-tasks.service';

const requirement = { id: 'req-1', code: 'US-001', status: 'ACTIVE', archivedAt: null, revision: 3, project: { id: 'project-1', workspaceId: 'workspace-1' } };

describe('ExternalTasksService', () => {
  it('replaces a generated localhost Origin footer with the configured public app URL', () => {
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = 'https://athena.example';
    const service = new ExternalTasksService({} as any, {} as any, {} as any, {} as any, {} as any);

    const result = (service as any).sourceDescription(
      'Task details\n\nOrigem: US-001 (revisão 2)\nhttp://localhost:8080/projects/project-1/requirements/req-1/edit',
      'project-1', 'req-1', 'US-001', 3,
    ) as string;

    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
    expect(result).toContain('https://athena.example/projects/project-1/requirements/req-1/edit');
    expect(result).not.toContain('localhost');
  });

  it('blocks VIEWER from creating a task before inspecting an external target', async () => {
    const prisma: any = {
      requirement: { findUnique: jest.fn().mockResolvedValue(requirement) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'VIEWER' }) },
      integrationProjectMapping: { findFirst: jest.fn() },
    };
    const service = new ExternalTasksService(prisma, {} as any, {} as any, {} as any, {} as any);
    await expect(service.create('viewer-1', requirement.id, { provider: 'GITHUB', mappingId: 'map-1', title: 'Task', description: 'Body' }, 'idem-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.integrationProjectMapping.findFirst).not.toHaveBeenCalled();
  });

  it('does not submit a second remote create while an idempotent operation is pending', async () => {
    const input = { provider: 'GITHUB' as const, mappingId: 'map-1', title: 'Task', description: 'Body' };
    const fingerprint = createHash('sha256').update(JSON.stringify({ requirementId: requirement.id, provider: input.provider, mappingId: input.mappingId, title: input.title, description: input.description, fields: {} })).digest('hex');
    const connection = { id: 'connection-1', kind: 'GITHUB', status: 'CONNECTED' };
    const prisma: any = {
      requirement: { findUnique: jest.fn().mockResolvedValue(requirement) },
      project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }) },
      workspace: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
      workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role: 'EDITOR' }) },
      integrationProjectMapping: { findFirst: jest.fn().mockResolvedValue({ id: input.mappingId, externalId: 'acme/repo', connectionId: connection.id, connection }) },
      integrationTaskOperation: { findUnique: jest.fn().mockResolvedValue({ id: 'op-1', requirementId: requirement.id, requestFingerprint: fingerprint, status: 'PENDING' }) },
    };
    const github = { createIssue: jest.fn() };
    const service = new ExternalTasksService(prisma, {} as any, {} as any, github as any, {} as any);
    await expect(service.create('editor-1', requirement.id, input, 'idem-1')).rejects.toBeInstanceOf(ConflictException);
    expect(github.createIssue).not.toHaveBeenCalled();
  });
});
