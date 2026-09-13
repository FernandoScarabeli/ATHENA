import { AiAnalysisJobService } from '../src/ai/ai-analysis-job.service';

describe('project dependency analysis job', () => {
  it('returns an already running pass without deleting its pending review queue', async () => {
    const running = { id: 'running', projectId: 'p', status: 'READING' };
    const prisma: any = { dependencyAnalysis: { findFirst: jest.fn().mockResolvedValue(running) }, requirement: { count: jest.fn() }, aiSuggestion: { deleteMany: jest.fn() } };
    const service = new AiAnalysisJobService(prisma, {} as any, null);
    await expect(service.start('p')).resolves.toEqual(running);
    expect(prisma.requirement.count).not.toHaveBeenCalled();
    expect(prisma.aiSuggestion.deleteMany).not.toHaveBeenCalled();
  });

  it('marks a disabled provider as a readable failed execution', async () => {
    const prisma: any = { dependencyAnalysis: { findUnique: jest.fn().mockResolvedValue({ id: 'a', projectId: 'p', status: 'QUEUED' }), update: jest.fn().mockResolvedValue({ status: 'FAILED' }) } };
    const service = new AiAnalysisJobService(prisma, {} as any, null);
    await service.run('a');
    expect(prisma.dependencyAnalysis.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('desativado') }) }));
  });
});
