import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/core/prisma.service';
import { RequirementsService } from '../src/requirements/requirements.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeDatabase = Boolean(testDatabaseUrl && /(?:^|\/)(athena_test|athena_test_[^/?]+)(?:\?|$)/.test(testDatabaseUrl));
const describeIntegration = safeDatabase ? describe : describe.skip;
if (testDatabaseUrl && !safeDatabase) throw new Error('TEST_DATABASE_URL deve apontar explicitamente para um banco athena_test ou athena_test_*');
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

describeIntegration('Folder management PostgreSQL integration', () => {
  let prisma: PrismaService;
  let service: RequirementsService;
  let workspaceId: string;
  let projectIds: string[] = [];
  let sourceFolderIds: string[] = [];
  let fallbackFolderIds: string[] = [];
  let userIds: string[] = [];
  let requirementIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new RequirementsService(prisma);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const users = await Promise.all(['owner', 'editor', 'viewer'].map(label => prisma.user.create({ data: { email: `folder-${label}-${suffix}@example.test`, name: `${label}-${suffix}`, passwordHash: 'integration-only' } })));
    userIds = users.map(user => user.id);
    const workspace = await prisma.workspace.create({ data: {
      name: `Folder integration ${suffix}`,
      members: { create: [{ userId: users[0].id, role: 'OWNER' }, { userId: users[1].id, role: 'EDITOR' }, { userId: users[2].id, role: 'VIEWER' }] },
      folders: { create: [{ name: 'Sem pasta' }, { name: 'A organizar', description: 'Antes' }] },
    }, include: { folders: true } });
    workspaceId = workspace.id;
    const projects = [
      await service.createProject(users[0].id, workspaceId, 'Primeiro', `F${suffix.replace(/\D/g, '').slice(-5)}A`),
      await service.createProject(users[0].id, workspaceId, 'Segundo', `F${suffix.replace(/\D/g, '').slice(-5)}B`),
    ];
    projectIds = projects.map(project => project.id);
    for (const project of projects) {
      const folders = await prisma.requirementFolder.findMany({ where: { projectId: project.id } });
      sourceFolderIds.push(folders.find(folder => folder.name === 'A organizar')!.id);
      fallbackFolderIds.push(folders.find(folder => folder.name === 'Sem pasta')!.id);
    }
    for (const [index, project] of projects.entries()) {
      const requirement = await service.create(users[0].id, project.id, { title: `US pasta ${index}`, folderId: sourceFolderIds[index], content: { type: 'doc', content: [] } });
      requirementIds.push(requirement.id);
    }
    await service.archive(users[1].id, requirementIds[1]);
  });

  afterAll(async () => {
    if (userIds.length) await prisma.activityLog.deleteMany({ where: { userId: { in: userIds } } });
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('enforces roles and isolates folder edits and deletes by project', async () => {
    await expect(service.updateFolder(userIds[2], projectIds[0], sourceFolderIds[0], { name: 'não pode' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateFolder(userIds[1], projectIds[0], sourceFolderIds[0], { name: '  Roadmap  ', description: 'Nova descrição' })).resolves.toMatchObject({ name: 'Roadmap', description: 'Nova descrição' });
    await expect(service.createFolder(userIds[1], projectIds[0], { name: 'roadmap' })).rejects.toThrow('Já existe');
    await expect(service.updateFolder(userIds[0], projectIds[0], fallbackFolderIds[0], { name: 'Outra' })).rejects.toThrow('reservada');
    await expect(service.deleteFolder(userIds[1], projectIds[0], fallbackFolderIds[0])).rejects.toThrow('não pode ser excluída');
    await expect(service.deleteFolder(userIds[1], projectIds[0], sourceFolderIds[0])).resolves.toEqual({ ok: true });
    await expect(prisma.requirement.findMany({ where: { id: requirementIds[0], folderId: fallbackFolderIds[0] }, select: { id: true, status: true } })).resolves.toEqual([{ id: requirementIds[0], status: 'DRAFT' }]);
    await expect(prisma.requirement.findUnique({ where: { id: requirementIds[1] }, select: { folderId: true, status: true } })).resolves.toMatchObject({ folderId: sourceFolderIds[1], status: 'ARCHIVED' });
    await expect(prisma.requirementFolder.findUnique({ where: { id: sourceFolderIds[0] } })).resolves.toBeNull();
    await expect(prisma.requirementFolder.findUnique({ where: { id: sourceFolderIds[1] } })).resolves.toMatchObject({ name: 'A organizar' });
  });

  it('enforces case-insensitive uniqueness when equivalent names race', async () => {
    const baseName = `Concurrent ${Date.now()}`;
    const results = await Promise.allSettled([
      service.createFolder(userIds[0], projectIds[0], { name: baseName }),
      service.createFolder(userIds[0], projectIds[0], { name: baseName.toLowerCase() }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.message).toContain('Já existe');
  });
});
