import { AiAnalysisJobService } from '../src/ai/ai-analysis-job.service';

describe('AiAnalysisJobService', () => {
  it('does not create a second pass while a project pass is running', async () => {
    const running = { id: 'a', projectId: 'p', status: 'READING' };
    const prisma: any = { dependencyAnalysis: { findFirst: jest.fn().mockResolvedValue(running) }, requirement: { count: jest.fn() }, aiSuggestion: { deleteMany: jest.fn() } };
    await expect(new AiAnalysisJobService(prisma, {} as any, null).start('p')).resolves.toEqual(running);
    expect(prisma.requirement.count).not.toHaveBeenCalled();
  });
  it('records a disabled provider as a failed readable pass', async () => {
    const prisma: any = { dependencyAnalysis: { findUnique: jest.fn().mockResolvedValue({ id: 'a', projectId: 'p', status: 'QUEUED' }), update: jest.fn().mockResolvedValue({ status: 'FAILED' }) } };
    await new AiAnalysisJobService(prisma, {} as any, null).run('a');
    expect(prisma.dependencyAnalysis.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });
});
