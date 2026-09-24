import { BadRequestException } from '@nestjs/common';
import { AiSuggestionService } from '../src/ai/ai-suggestion.service';
import { DependencyResponseSchema } from '../src/ai/ai.provider';

describe('dependency suggestion persistence', () => {
  const sourceId = '11111111-1111-4111-8111-111111111111';
  const targetId = '22222222-2222-4222-8222-822222222222';
  it('validates the restricted dependency response contract', () => {
    expect(DependencyResponseSchema.parse({ dependencies: [{ sourceRequirementId: sourceId, targetRequirementId: targetId, confidence: .8, justification: 'A tela precisa da autenticação.' }] }).dependencies).toHaveLength(1);
    expect(() => DependencyResponseSchema.parse({ dependencies: [{ sourceRequirementId: sourceId, targetRequirementId: targetId, confidence: 2, justification: '' }] })).toThrow();
  });
  it('persists pending suggestions without changing the canonical graph', async () => {
    const tx: any = { aiSuggestion: { createMany: jest.fn() }, requirementRelation: { upsert: jest.fn() }, dependencyAnalysis: { update: jest.fn() } };
    const prisma: any = { dependencyAnalysis: { findUnique: jest.fn().mockResolvedValue({ projectId: 'p', status: 'PERSISTING' }) }, requirement: { findMany: jest.fn().mockResolvedValue([{ id: sourceId }, { id: targetId }]) }, requirementRelation: { findMany: jest.fn().mockResolvedValue([]) }, aiSuggestion: { findMany: jest.fn().mockResolvedValue([]) }, $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new AiSuggestionService(prisma);
    await expect(service.persistDependencies('analysis', { dependencies: [{ sourceRequirementId: sourceId, targetRequirementId: targetId, confidence: .8, justification: 'Depende da autenticação.' }] })).resolves.toBe(1);
    expect(tx.aiSuggestion.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ status: 'PENDING' })] }));
    expect(tx.requirementRelation.upsert).not.toHaveBeenCalled();
  });
  it('rejects self dependencies before writing the graph', async () => {
    const prisma: any = { dependencyAnalysis: { findUnique: jest.fn().mockResolvedValue({ projectId: 'p', status: 'PERSISTING' }) } };
    await expect(new AiSuggestionService(prisma).persistDependencies('analysis', { dependencies: [{ sourceRequirementId: sourceId, targetRequirementId: sourceId, confidence: .8, justification: 'inválida' }] })).rejects.toBeInstanceOf(BadRequestException);
  });
});
