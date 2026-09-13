import { DependencyResponseSchema } from '../src/ai/ai.provider';
import { AiSuggestionService } from '../src/ai/ai-suggestion.service';
import { BadRequestException } from '@nestjs/common';

describe('global dependency response contract', () => {
  const source = '00000000-0000-4000-8000-000000000001';
  const target = '00000000-0000-4000-8000-000000000002';

  it('accepts only the directed dependency payload', () => {
    expect(DependencyResponseSchema.parse({ dependencies: [{ sourceRequirementId: source, targetRequirementId: target, confidence: .8, justification: 'O critério de pagamento exige o pedido.' }] })).toMatchObject({ dependencies: [{ sourceRequirementId: source, targetRequirementId: target }] });
  });

  it('rejects malformed JSON shapes and forbidden relation fields', () => {
    expect(() => DependencyResponseSchema.parse({ suggestions: [] })).toThrow();
    expect(() => DependencyResponseSchema.parse({ dependencies: [{ sourceRequirementId: source, targetRequirementId: target, relationType: 'BLOCKS', confidence: .8, justification: 'x' }] })).toThrow();
    expect(() => DependencyResponseSchema.parse({ dependencies: [{ sourceRequirementId: 'outside-project', targetRequirementId: target, confidence: .8, justification: 'x' }] })).toThrow();
  });

  it('rejects self references and IDs outside the analysis project before persistence', async () => {
    const prisma: any = {
      dependencyAnalysis: { findUnique: jest.fn().mockResolvedValue({ projectId: 'project', status: 'PERSISTING' }) },
      requirement: { findMany: jest.fn().mockResolvedValue([{ id: source }]) },
      requirementRelation: { findMany: jest.fn() },
      aiSuggestion: { findMany: jest.fn() },
    };
    const service = new AiSuggestionService(prisma);
    await expect(service.persistDependencies('analysis', { dependencies: [{ sourceRequirementId: source, targetRequirementId: source, confidence: .7, justification: 'x' }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.persistDependencies('analysis', { dependencies: [{ sourceRequirementId: source, targetRequirementId: target, confidence: .7, justification: 'x' }] })).rejects.toBeInstanceOf(BadRequestException);
  });
});
