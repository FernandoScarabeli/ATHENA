import { ForbiddenException } from '@nestjs/common';
import { AiSuggestionService } from '../src/ai/ai-suggestion.service';

describe('dependency decisions', () => {
  const suggestion: any = { id: 's1', dependencyAnalysisId: 'a', requirementId: 'source', type: 'RELATION', relationType: 'DEPENDS_ON', targetRequirementId: 'target', status: 'PENDING', targetRequirement: { id: 'target', projectId: 'project', status: 'ACTIVE', archivedAt: null }, requirement: { id: 'source', projectId: 'project', project: { workspaceId: 'workspace' } } };
  function setup(role = 'EDITOR') {
    const tx: any = { aiSuggestion: { findUnique: jest.fn().mockResolvedValue(suggestion), update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...suggestion, ...data })) }, workspaceMember: { findUnique: jest.fn().mockResolvedValue({ role }) }, requirementRelation: { upsert: jest.fn().mockResolvedValue({ id: 'edge' }) } };
    return { tx, service: new AiSuggestionService({ $transaction: jest.fn(async (work: any) => work(tx)) } as any) };
  }
  it('confirms a valid dependency and creates its graph edge atomically', async () => {
    const { service, tx } = setup();
    await expect(service.approve('editor', 's1')).resolves.toMatchObject({ status: 'CONFIRMED' });
    expect(tx.requirementRelation.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ sourceId: 'source', targetId: 'target', type: 'DEPENDS_ON' }) }));
  });
  it('keeps viewers from deciding', async () => {
    const { service } = setup('VIEWER');
    await expect(service.approve('viewer', 's1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
