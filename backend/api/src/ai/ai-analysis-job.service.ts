import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AiProvider, DependencyResponse } from './ai.provider';
import { AiSuggestionService } from './ai-suggestion.service';
import { PrismaService } from '../core/prisma.service';
import { DependencyAnalysisStatus, RequirementStatus } from '@prisma/client';

type Story = { id: string; code: string; title: string; status: string; text: string; chunks: string[]; vector?: number[] };

/**
 * Global analysis is retrieval-augmented, not a single ever-growing prompt.
 * Every requirement and every part of its document is embedded; the generator
 * then validates the strongest project-wide candidates in context-safe groups.
 * This keeps the result bounded for 5 or 200 US without silently truncating a
 * project document or relying on a model's finite context window.
 */
@Injectable()
export class AiAnalysisJobService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiAnalysisJobService.name);
  private readonly active = new Set<string>();
  constructor(private readonly prisma: PrismaService, private readonly suggestions: AiSuggestionService, @Inject('AI_PROVIDER') private readonly provider: AiProvider | null) {}

  /** Jobs are persisted but their worker is in-process. Resume unfinished
   * passes after a deploy/restart instead of leaving the map stuck on READING. */
  async onApplicationBootstrap() {
    const interrupted = await this.prisma.dependencyAnalysis.findMany({
      where: { status: { in: [DependencyAnalysisStatus.QUEUED, DependencyAnalysisStatus.READING, DependencyAnalysisStatus.PERSISTING] } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    interrupted.forEach(analysis => setImmediate(() => void this.run(analysis.id).catch(error => this.logger.error(`dependency analysis resume crashed id=${analysis.id}`, error instanceof Error ? error.stack : undefined))));
  }

  async start(projectId: string) {
    const running = await this.prisma.dependencyAnalysis.findFirst({ where: { projectId, status: { in: [DependencyAnalysisStatus.QUEUED, DependencyAnalysisStatus.READING, DependencyAnalysisStatus.PERSISTING] } }, orderBy: { createdAt: 'desc' } });
    if (running) return running;
    const totalRequirements = await this.prisma.requirement.count({ where: { projectId, archivedAt: null, status: { in: [RequirementStatus.DRAFT, RequirementStatus.ACTIVE] } } });
    await this.prisma.aiSuggestion.deleteMany({ where: { requirement: { projectId }, relationType: 'DEPENDS_ON', status: 'PENDING' } });
    const analysis = await this.prisma.dependencyAnalysis.create({ data: { projectId, totalRequirements } });
    setImmediate(() => void this.run(analysis.id).catch(error => this.logger.error(`dependency analysis crashed id=${analysis.id}`, error instanceof Error ? error.stack : undefined)));
    return analysis;
  }

  async latest(projectId: string) { return this.prisma.dependencyAnalysis.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' }, include: { suggestions: { where: { status: 'PENDING' }, include: { requirement: { select: { id: true, code: true, title: true } }, targetRequirement: { select: { id: true, code: true, title: true } } }, orderBy: { createdAt: 'asc' } } } }); }

  async run(analysisId: string) {
    if (this.active.has(analysisId)) return;
    this.active.add(analysisId);
    try {
      const analysis = await this.prisma.dependencyAnalysis.findUnique({ where: { id: analysisId } });
      if (!analysis || analysis.status === 'COMPLETED' || analysis.status === 'FAILED') return analysis;
      if (!this.provider) return this.fail(analysisId, 'Provider de IA desativado (AI_PROVIDER=disabled)');
      await this.prisma.dependencyAnalysis.update({ where: { id: analysisId }, data: { status: 'READING', startedAt: new Date(), error: null } });
      const context = await this.context(analysis.projectId);
      const stories = await this.index(context.requirements);
      const dependencies: DependencyResponse['dependencies'] = [];
      const groups = this.groups(stories, context);
      for (const group of groups) {
        const response = await this.provider.analyseDependencies(group);
        const allowed = new Set(group.sources.flatMap(source => source.candidates.map(candidate => `${source.id}:${candidate.id}`)));
        for (const dependency of response.dependencies) if (allowed.has(`${dependency.sourceRequirementId}:${dependency.targetRequirementId}`)) dependencies.push(dependency);
      }
      await this.prisma.dependencyAnalysis.update({ where: { id: analysisId }, data: { status: 'PERSISTING' } });
      const count = await this.suggestions.persistDependencies(analysisId, { dependencies });
      return this.prisma.dependencyAnalysis.update({ where: { id: analysisId }, data: { status: 'COMPLETED', processedRequirements: stories.length, suggestionsFound: count, completedAt: new Date(), error: null } });
    } catch (error) { return this.fail(analysisId, error instanceof Error ? error.message : 'Falha desconhecida no provider de IA'); }
    finally { this.active.delete(analysisId); }
  }

  private async fail(id: string, error: string) { this.logger.warn(`dependency analysis failed id=${id}: ${error}`); return this.prisma.dependencyAnalysis.update({ where: { id }, data: { status: 'FAILED', error: error.slice(0, 1000), completedAt: new Date() } }); }
  private text(value: unknown) { const parts: string[] = []; const visit = (node: unknown) => { if (!node || typeof node !== 'object') return; const item = node as { text?: unknown; content?: unknown }; if (typeof item.text === 'string') parts.push(item.text); if (Array.isArray(item.content)) item.content.forEach(visit); }; visit(value); return parts.join(' ').replace(/\s+/g, ' ').trim(); }
  private split(text: string, size = 1200) { const words = text.split(/\s+/).filter(Boolean); const chunks: string[] = []; let current = ''; for (const word of words) { if (current && current.length + word.length + 1 > size) { chunks.push(current); current = word; } else current += `${current ? ' ' : ''}${word}`; } if (current) chunks.push(current); return chunks.length ? chunks : ['']; }
  private average(vectors: number[][]) { const result = new Array(vectors[0]?.length ?? 0).fill(0); vectors.forEach(vector => vector.forEach((value, index) => { result[index] += value; })); const length = Math.hypot(...result) || 1; return result.map(value => value / length); }
  private cosine(a: number[], b: number[]) { return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0); }
  private async index(stories: Story[]) {
    const pieces = stories.flatMap(story => story.chunks.map(chunk => ({ story, chunk: `${story.code} ${story.title}\n${chunk}` })));
    const vectors: number[][] = [];
    // Ollama commonly runs on CPU in a local installation. Six short texts
    // keep an embedding request comfortably below the configured timeout,
    // including when a DOCX contains several large sections.
    for (let index = 0; index < pieces.length; index += 6) vectors.push(...await this.provider!.embedMany(pieces.slice(index, index + 6).map(item => item.chunk)));
    const byStory = new Map<Story, number[][]>();
    pieces.forEach((piece, index) => byStory.set(piece.story, [...(byStory.get(piece.story) ?? []), vectors[index]]));
    return stories.map(story => ({ ...story, vector: this.average(byStory.get(story) ?? [[]]) }));
  }
  private evidence(story: Story) { return story.chunks.slice(0, 2).join(' ').slice(0, 1100); }
  private groups(stories: Story[], context: Awaited<ReturnType<AiAnalysisJobService['context']>>) {
    const rejected = new Set(context.dismissedDependencies.map(item => `${item.requirementId}:${item.targetRequirementId}`));
    const confirmed = new Set(context.confirmedDependencies.map(item => `${item.sourceId}:${item.targetId}`));
    const sourceContexts = stories.map(source => {
      const eligible = stories.filter(target => target.id !== source.id && !rejected.has(`${source.id}:${target.id}`) && !confirmed.has(`${source.id}:${target.id}`));
      const semantic = eligible.slice().sort((a, b) => this.cosine(b.vector!, source.vector!) - this.cosine(a.vector!, source.vector!)).slice(0, Math.min(4, eligible.length));
      // Explicit US references are deterministic candidates even when their
      // wording is too different for semantic similarity to rank them high.
      const mentioned = new Set((source.text.match(/\bUS-\d+\b/gi) ?? []).map(code => code.toUpperCase()));
      const candidates = [...new Map([...eligible.filter(target => mentioned.has(target.code.toUpperCase())), ...semantic].map(target => [target.id, target])).values()];
      return { id: source.id, code: source.code, title: source.title, evidence: this.evidence(source).slice(0, 420), candidates: candidates.map(target => ({ id: target.id, code: target.code, title: target.title, evidence: this.evidence(target).slice(0, 120) })) };
    });
    // One origin per generation is intentional. It bounds the local CPU work
    // even for a project imported from large DOCX files, while all origins are
    // still evaluated in the same pass.
    const groups = []; for (let index = 0; index < sourceContexts.length; index += 1) groups.push({ project: context.project, sources: sourceContexts.slice(index, index + 1), confirmedDependencies: context.confirmedDependencies, dismissedDependencies: context.dismissedDependencies }); return groups;
  }
  private async context(projectId: string) {
    const [project, requirements, confirmed, dismissed] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, name: true, key: true } }),
      this.prisma.requirement.findMany({ where: { projectId, archivedAt: null, status: { in: [RequirementStatus.DRAFT, RequirementStatus.ACTIVE] } }, select: { id: true, code: true, title: true, content: true, status: true, criteria: { select: { text: true, title: true, given: true, whenText: true, thenText: true }, orderBy: { position: 'asc' } } }, orderBy: { code: 'asc' } }),
      this.prisma.requirementRelation.findMany({ where: { source: { projectId }, target: { projectId } }, select: { sourceId: true, targetId: true, type: true } }),
      this.prisma.aiSuggestion.findMany({ where: { requirement: { projectId }, relationType: 'DEPENDS_ON', status: 'DISMISSED' }, select: { requirementId: true, targetRequirementId: true } }),
    ]);
    const stories: Story[] = requirements.map(requirement => ({ id: requirement.id, code: requirement.code, title: requirement.title, status: requirement.status, text: [requirement.title, this.text(requirement.content), ...requirement.criteria.flatMap(item => [item.title, item.text, item.given, item.whenText, item.thenText].filter((value): value is string => Boolean(value)))].join('\n'), chunks: [] }));
    stories.forEach(story => { story.chunks = this.split(story.text); });
    return { project, requirements: stories, confirmedDependencies: confirmed.filter(item => item.type === 'DEPENDS_ON').map(({ sourceId, targetId }) => ({ sourceId, targetId })), dismissedDependencies: dismissed.filter((item): item is { requirementId: string; targetRequirementId: string } => Boolean(item.targetRequirementId)) };
  }
}
