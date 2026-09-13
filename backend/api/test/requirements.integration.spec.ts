import { ForbiddenException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from '../src/core/prisma.service';
import { CreateRequirementDto, validTipTap } from '../src/requirements/dto';
import { RequirementsService } from '../src/requirements/requirements.service';

/**
 * This suite is intentionally opt-in. It must never accidentally connect to
 * the developer/demo database. Run with TEST_DATABASE_URL pointing to the
 * disposable athena_test database and pass it through DATABASE_URL only to
 * this process.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseIsExplicitAndSafe = Boolean(testDatabaseUrl && /(?:^|\/)(athena_test|athena_test_[^/?]+)(?:\?|$)/.test(testDatabaseUrl));
const describeIntegration = databaseIsExplicitAndSafe ? describe : describe.skip;

if (testDatabaseUrl && !databaseIsExplicitAndSafe) {
  throw new Error('TEST_DATABASE_URL deve apontar explicitamente para um banco athena_test ou athena_test_*');
}
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

describeIntegration('RequirementsService PostgreSQL integration', () => {
  let prisma: PrismaService;
  let service: RequirementsService;
  let workspaceId: string;
  let projectId: string;
  let folderId: string;
  let requirementId: string;
  let relatedRequirementId: string;
  let templateId: string;
  let ownerEmail: string;
  const userIds: string[] = [];
  const users = {
    owner: '', editor: '', viewer: '', secondOwner: '', external: '',
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new RequirementsService(prisma);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    ownerEmail = `owner-${suffix}@example.test`;
    const created = await Promise.all([
      ['owner', 'owner', 'OWNER'], ['editor', 'editor', 'EDITOR'], ['viewer', 'viewer', 'VIEWER'],
      ['second-owner', 'second-owner', 'OWNER'], ['external', 'external', 'VIEWER'],
    ].map(async ([label, name]) => {
      const user = await prisma.user.create({ data: { email: label === 'owner' ? ownerEmail : `${label}-${suffix}@example.test`, name: `${name}-${suffix}`, passwordHash: 'integration-only' } });
      userIds.push(user.id);
      return user.id;
    }));
    [users.owner, users.editor, users.viewer, users.secondOwner, users.external] = created;

    const workspace = await prisma.workspace.create({ data: {
      name: `ATH-002 ${suffix}`,
      members: { create: [
        { userId: users.owner, role: 'OWNER' }, { userId: users.editor, role: 'EDITOR' },
        { userId: users.viewer, role: 'VIEWER' }, { userId: users.secondOwner, role: 'OWNER' },
      ] },
      folders: { create: { name: 'Sem pasta' } },
    }, include: { folders: true } });
    workspaceId = workspace.id;
    folderId = workspace.folders[0].id;
    const project = await prisma.project.create({ data: { workspaceId, name: `Projeto ${suffix}`, key: `T${suffix.replace(/\D/g, '').slice(-8) || '002'}` } });
    projectId = project.id;
    const requirement = await service.create(users.owner, projectId, { title: 'Integração ATH-002', folderId, content: { type: 'doc', content: [] } });
    requirementId = requirement.id;
    const related = await service.create(users.owner, projectId, { title: 'Relacionado ATH-002', folderId, content: { type: 'doc', content: [] } });
    relatedRequirementId = related.id;
  });

  afterAll(async () => {
    // ActivityLog.user has RESTRICT semantics, so remove only this suite's
    // workspace activity rows before deleting its uniquely-created users.
    if (userIds.length) await prisma.activityLog.deleteMany({ where: { userId: { in: userIds }, projectId } });
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('enforce roles and workspace isolation across core resources', async () => {
    await expect(service.project(users.viewer, projectId)).resolves.toMatchObject({ id: projectId });
    await expect(service.project(users.external, projectId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createProject(users.editor, workspaceId, 'não permitido', `NO${Date.now()}`)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createProject(users.owner, workspaceId, 'Projeto autorizado', `OK${Date.now()}`)).resolves.toMatchObject({ workspaceId });

    const template = await service.createTemplate(users.editor, workspaceId, {
      name: `Template ${Date.now()}`,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'modelo original' }] }] },
      acceptanceCriteria: [{ title: 'Acesso', text: 'consegue entrar', given: 'uma conta válida', when: 'envia credenciais', then: 'o acesso é concedido' }],
    });
    templateId = template.id;
    const copied = await service.create(users.editor, projectId, { title: 'US copiada do template', folderId, templateId, content: {} });
    expect(copied.content).toEqual(template.content);
    expect(copied.criteria).toEqual([expect.objectContaining({ title: 'Acesso', text: 'consegue entrar', given: 'uma conta válida', whenText: 'envia credenciais', thenText: 'o acesso é concedido', position: 0 })]);
    await service.updateTemplate(users.editor, templateId, { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'modelo alterado' }] }] }, acceptanceCriteria: [] });
    await expect(service.requirement(users.viewer, copied.id)).resolves.toMatchObject({ content: template.content, criteria: expect.arrayContaining([expect.objectContaining({ title: 'Acesso' })]) });
    const emptyCopy = await service.create(users.editor, projectId, { title: 'US sem critérios', folderId, templateId, content: {}, acceptanceCriteria: [] });
    expect(emptyCopy.criteria).toEqual([]);
    await expect(service.template(users.viewer, templateId)).resolves.toMatchObject({ id: templateId });
    await expect(service.template(users.external, templateId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateTemplate(users.viewer, templateId, { name: 'não permitido' })).rejects.toBeInstanceOf(ForbiddenException);

    await expect(service.relate(users.editor, requirementId, { targetId: relatedRequirementId, type: 'RELATED_TO' } as never)).resolves.toMatchObject({ sourceId: requirementId, targetId: relatedRequirementId });
    await expect(service.relations(users.viewer, requirementId)).resolves.toEqual(expect.any(Array));
    await expect(service.relate(users.external, requirementId, { targetId: relatedRequirementId, type: 'RELATED_TO' } as never)).rejects.toBeInstanceOf(ForbiddenException);

    await expect(service.createReference(users.editor, requirementId, { type: 'PROTOTYPE', name: 'Protótipo', url: 'https://example.test/prototype' } as never)).rejects.toMatchObject({ response: { code: 'MANUAL_REFERENCE_CREATION_DISABLED' } });
    await expect(service.approveReference(users.editor, requirementId, { type: 'PROTOTYPE', name: 'Protótipo', url: 'https://example.test/prototype' } as never)).resolves.toMatchObject({ requirementId });
    await expect(service.references(users.viewer, requirementId)).resolves.toEqual(expect.any(Array));
    await expect(service.approveReference(users.external, requirementId, { type: 'PROTOTYPE', name: 'externa', url: 'https://example.test' } as never)).rejects.toBeInstanceOf(ForbiddenException);

    await expect(service.members(users.owner, workspaceId)).resolves.toEqual(expect.any(Array));
    await expect(service.members(users.editor, workspaceId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.addMember(users.editor, workspaceId, { email: ownerEmail, role: 'VIEWER' } as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.participants(users.viewer, workspaceId)).resolves.toEqual(expect.any(Array));
    await expect(service.participants(users.external, workspaceId)).rejects.toBeInstanceOf(ForbiddenException);

    await expect(service.requirement(users.viewer, requirementId)).resolves.toMatchObject({ id: requirementId });
    await expect(service.update(users.viewer, requirementId, { revision: 1, title: 'não pode' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createFolder(users.viewer, workspaceId, { name: 'viewer não pode' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.requirement(users.external, requirementId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.folders(users.external, workspaceId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createTemplate(users.external, workspaceId, { name: 'externo', content: { type: 'doc', content: [] } })).rejects.toBeInstanceOf(ForbiddenException);

    await expect(service.update(users.editor, requirementId, { revision: 1, title: 'editado pelo editor' })).resolves.toMatchObject({ revision: 2 });
    const historyFolder = await service.createFolder(users.editor, workspaceId, { name: `Histórico ${Date.now()}` });
    await expect(service.update(users.editor, requirementId, {
      revision: 2,
      title: 'editado com documento',
      folderId: historyFolder.id,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'documento revisado' }] }] },
      acceptanceCriteria: [{ text: 'critério novo', title: 'Critério', given: 'contexto', when: 'ação', then: 'resultado' }],
    })).resolves.toMatchObject({ revision: 3 });
    const versions = await service.versions(users.viewer, requirementId);
    expect(versions.map(version => version.revision)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({ current: true, snapshot: { title: 'editado com documento', folderId: historyFolder.id } });
    expect(versions[1].snapshot).not.toHaveProperty('folder');
    expect(versions[1].snapshot).not.toHaveProperty('references');
    await expect(service.diff(users.viewer, requirementId, 2, 3)).resolves.toMatchObject({
      changedFields: expect.arrayContaining(['title', 'content', 'folderId']),
      criteriaAdded: ['critério novo'],
      criteriaRemoved: [],
    });
    await expect(service.createComment(users.viewer, requirementId, { body: 'viewer pode comentar', mentionedUserIds: [users.editor] })).resolves.toMatchObject({ requirementId });
    await expect(service.comments(users.viewer, requirementId)).resolves.toEqual(expect.any(Array));
    await expect(service.comments(users.external, requirementId)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.notifications(users.editor)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ userId: users.editor })]));
    await expect(service.notifications(users.external)).resolves.toEqual([]);

  });

  it('preserves one Owner when two concurrent removals race', async () => {
    const results = await Promise.allSettled([
      service.removeMember(users.owner, workspaceId, users.secondOwner),
      service.removeMember(users.secondOwner, workspaceId, users.owner),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    await expect(prisma.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } })).resolves.toBe(1);

    // The race test intentionally removes one Owner. Restore the fixture
    // before the next test so the suite does not depend on test ordering.
    for (const userId of [users.owner, users.secondOwner]) {
      await prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        create: { workspaceId, userId, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
    }
  });

  it('does not downgrade the last Owner through the membership upsert path', async () => {
    const remaining = await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId, role: 'OWNER' }, select: { userId: true, user: { select: { email: true } } } });
    const otherOwnerId = remaining.userId === users.owner ? users.secondOwner : users.owner;
    await prisma.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: otherOwnerId } }, data: { role: 'EDITOR' } });
    try {
      await expect(service.addMember(remaining.userId, workspaceId, { email: remaining.user.email, role: 'VIEWER' } as never)).rejects.toThrow('ao menos um owner');
      await expect(prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: remaining.userId } }, select: { role: true } })).resolves.toEqual({ role: 'OWNER' });
    } finally {
      await prisma.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: otherOwnerId } }, data: { role: 'OWNER' } });
    }
  });

  it('returns the current revision when two sessions update concurrently', async () => {
    const current = await prisma.requirement.findUniqueOrThrow({ where: { id: requirementId }, select: { revision: true } });
    const results = await Promise.allSettled([
      service.update(users.editor, requirementId, { revision: current.revision, title: 'sessão A' }),
      service.update(users.editor, requirementId, { revision: current.revision, title: 'sessão B' }),
    ]);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected).toBeDefined();
    expect(rejected.reason.getResponse()).toMatchObject({ details: { currentRevision: current.revision + 1 } });
    await expect(prisma.requirement.findUniqueOrThrow({ where: { id: requirementId }, select: { revision: true } })).resolves.toMatchObject({ revision: current.revision + 1 });
  });

  it('allocates unique sequential US codes under concurrent creation', async () => {
    const created = await Promise.all(Array.from({ length: 12 }, (_, index) => service.create(users.editor, projectId, {
      title: `Concorrente ${index}`,
      folderId,
      content: { type: 'doc', content: [] },
    })));
    const codes = created.map(requirement => requirement.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(expect.arrayContaining(created.map((_, index) => `US-${String(index + 5).padStart(3, '0')}`)));
  });

  it('rejects raw HTML, unsafe URLs and documents over 256 KB at the DTO boundary', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const base = { title: 'validação', folderId, content: { type: 'doc', content: [] } };
    await expect(pipe.transform({ ...base, content: '<p>HTML bruto</p>' }, { type: 'body', metatype: CreateRequirementDto })).rejects.toThrow();
    await expect(pipe.transform({ ...base, content: { type: 'doc', content: [{ type: 'html', html: '<p>markup</p>' }] } }, { type: 'body', metatype: CreateRequirementDto })).rejects.toThrow();
    await expect(pipe.transform({ ...base, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Use <script> como exemplo' }] }] } }, { type: 'body', metatype: CreateRequirementDto })).resolves.toBeInstanceOf(CreateRequirementDto);
    expect(validTipTap({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] })).toBe(false);
    await expect(pipe.transform({ ...base, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(260 * 1024) }] }] } }, { type: 'body', metatype: CreateRequirementDto })).rejects.toThrow();
  });

  it('serializes symmetric RELATED_TO duplicates through the database constraint', async () => {
    const [left, right] = await Promise.all([
      service.create(users.owner, projectId, { title: 'Relação simétrica A', folderId, content: { type: 'doc', content: [] } }),
      service.create(users.owner, projectId, { title: 'Relação simétrica B', folderId, content: { type: 'doc', content: [] } }),
    ]);
    const results = await Promise.allSettled([
      service.relate(users.editor, left.id, { targetId: right.id, type: 'RELATED_TO' } as never),
      service.relate(users.editor, right.id, { targetId: left.id, type: 'RELATED_TO' } as never),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected').map(result => (result as PromiseRejectedResult).reason.message)).toEqual(['Esta relação já existe']);
    await expect(prisma.requirementRelation.count({ where: { type: 'RELATED_TO', OR: [{ sourceId: left.id, targetId: right.id }, { sourceId: right.id, targetId: left.id }] } })).resolves.toBe(1);
  });

  it('archives atomically, preserves history/comments, and exposes disjoint read-only lists', async () => {
    const target = await service.create(users.owner, projectId, {
      title: 'Alvo do arquivamento', folderId, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'conteúdo preservado' }] }] },
    });
    await service.relate(users.editor, target.id, { targetId: relatedRequirementId, type: 'RELATED_TO' } as never);
    await service.update(users.editor, target.id, { revision: target.revision, title: 'Alvo revisado' });
    const thread = await service.createComment(users.viewer, target.id, { body: 'Comentário preservado' });
    const beforeArchive = await service.requirement(users.viewer, target.id);
    const expectedRevision = beforeArchive.revision;
    const archived = await service.archive(users.editor, target.id);

    expect(archived).toMatchObject({ id: target.id, status: 'ARCHIVED', title: 'Alvo revisado' });
    expect(archived.archivedAt).toBeInstanceOf(Date);
    await expect(service.list(users.viewer, projectId)).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: target.id })]));
    await expect(service.list(users.viewer, projectId, 'archived')).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: target.id, status: 'ARCHIVED' })]));
    await expect(service.list(users.external, projectId, 'archived')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list(users.viewer, projectId, 'invalid' as never)).rejects.toThrow('Status de requisito inválido');

    await expect(prisma.requirementRelation.findMany({ where: { OR: [{ sourceId: target.id }, { targetId: target.id }] } })).resolves.toEqual([]);
    await expect(service.requirement(users.viewer, target.id)).resolves.toMatchObject({ id: target.id, title: 'Alvo revisado', status: 'ARCHIVED' });
    await expect(service.versions(users.viewer, target.id)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ requirementId: target.id })]));
    await expect(service.comments(users.viewer, target.id)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: thread.id })]));
    await expect(prisma.activityLog.count({ where: { entityId: target.id, action: 'REQUIREMENT_ARCHIVED' } })).resolves.toBe(1);

    // Repeating cancellation is a no-op: it neither deletes preserved data nor logs again.
    await expect(service.archive(users.editor, target.id)).resolves.toMatchObject({ id: target.id, status: 'ARCHIVED' });
    await expect(prisma.activityLog.count({ where: { entityId: target.id, action: 'REQUIREMENT_ARCHIVED' } })).resolves.toBe(1);
    await expect(service.update(users.editor, target.id, { revision: expectedRevision, title: 'não pode' })).rejects.toThrow('US arquivada não aceita edição');
    await expect(service.createComment(users.viewer, target.id, { body: 'não pode' })).rejects.toThrow('somente leitura');
    await expect(service.replyComment(users.viewer, thread.id, { body: 'não pode' })).rejects.toThrow('somente leitura');
    await expect(service.setCommentResolution(users.viewer, thread.id, true)).rejects.toThrow('somente leitura');
    await expect(service.relate(users.editor, target.id, { targetId: relatedRequirementId, type: 'RELATED_TO' } as never)).rejects.toThrow('cancelada');
    await expect(service.requirement(users.external, target.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
