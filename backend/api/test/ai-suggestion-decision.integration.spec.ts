import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/core/prisma.service';
import { AiSuggestionService } from '../src/ai/ai-suggestion.service';

const url = process.env.TEST_DATABASE_URL;
const safe = Boolean(url && /(?:^|\/)(athena_test|athena_test_[^/?]+)(?:\?|$)/.test(url));
const describeIntegration = safe ? describe : describe.skip;
if (url && !safe) throw new Error('TEST_DATABASE_URL deve apontar explicitamente para um banco athena_test ou athena_test_*');
if (url) process.env.DATABASE_URL = url;

describeIntegration('AI suggestion decisions PostgreSQL integration', () => {
  let prisma: PrismaService;
  let service: AiSuggestionService;
  let workspaceId: string;
  let sourceId: string;
  let targetId: string;
  let suggestionId: string;
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  let externalId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new AiSuggestionService(prisma);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const users = await Promise.all(['owner', 'editor', 'viewer', 'external'].map(name => prisma.user.create({ data: { email: `ai-${name}-${suffix}@example.test`, name, passwordHash: 'integration-only' } })));
    [ownerId, editorId, viewerId, externalId] = users.map(user => user.id);
    const workspace = await prisma.workspace.create({ data: { name: `AI decisions ${suffix}`, members: { create: [{ userId: ownerId, role: 'OWNER' }, { userId: editorId, role: 'EDITOR' }, { userId: viewerId, role: 'VIEWER' }] }, folders: { create: { name: 'Sem pasta' } } }, include: { folders: true } });
    workspaceId = workspace.id;
    const project = await prisma.project.create({ data: { workspaceId, name: 'Projeto IA', key: `AI${Date.now()}` } });
    const requirements = await prisma.requirement.createManyAndReturn({ data: [
      { projectId: project.id, code: 'US-001', type: 'USER_STORY', title: 'Origem', content: { type: 'doc' }, folderId: workspace.folders[0].id, status: 'ACTIVE' },
      { projectId: project.id, code: 'US-002', type: 'USER_STORY', title: 'Alvo', content: { type: 'doc' }, folderId: workspace.folders[0].id, status: 'ACTIVE' },
    ] });
    [sourceId, targetId] = requirements.map(requirement => requirement.id);
    const analysis = await prisma.impactAnalysis.create({ data: { requirementId: sourceId, status: 'COMPLETED' } });
    const suggestion = await prisma.aiSuggestion.create({ data: { analysisId: analysis.id, requirementId: sourceId, type: 'RELATION', targetRequirementId: targetId, relationType: 'BLOCKS', confidence: 0.9, justification: 'integração' } });
    suggestionId = suggestion.id;
  });

  afterAll(async () => {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } });
    if (ownerId || editorId || viewerId || externalId) await prisma.user.deleteMany({ where: { id: { in: [ownerId, editorId, viewerId, externalId].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it('allows viewer listing, rejects viewer decision, and serializes duplicate approvals', async () => {
    await expect(service.listForRequirement(viewerId, sourceId)).resolves.toHaveLength(1);
    await expect(service.approve(viewerId, suggestionId)).rejects.toBeInstanceOf(ForbiddenException);
    await Promise.all([service.approve(editorId, suggestionId), service.approve(ownerId, suggestionId)]);
    await expect(prisma.requirementRelation.count({ where: { sourceId, targetId, type: 'BLOCKS' } })).resolves.toBe(1);
    await expect(prisma.aiSuggestion.findUnique({ where: { id: suggestionId } })).resolves.toMatchObject({ status: 'CONFIRMED', error: null });
  });
});
