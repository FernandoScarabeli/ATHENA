import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AiSuggestionStatus, DependencyAnalysisStatus, Prisma, RelationType, RequirementStatus, WorkspaceRole } from '@prisma/client';
import { DependencyResponse, DependencyResponseSchema } from './ai.provider';
import { PrismaService } from '../core/prisma.service';

@Injectable()
export class AiSuggestionService {
  private readonly readRoles: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.EDITOR, WorkspaceRole.VIEWER];
  private readonly editRoles: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.EDITOR];
  constructor(private readonly prisma: PrismaService) {}

  async listForProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: project.workspaceId, userId } } });
    if (!member || !this.readRoles.includes(member.role)) throw new ForbiddenException('Você não tem permissão para esta ação');
    return this.prisma.aiSuggestion.findMany({ where: { requirement: { projectId }, dependencyAnalysisId: { not: null }, status: 'PENDING' }, include: { requirement: { select: { id: true, code: true, title: true } }, targetRequirement: { select: { id: true, code: true, title: true } }, }, orderBy: { createdAt: 'asc' } });
  }

  /** Compatibility reader for historical per-requirement suggestions. New
   * dependency runs are project-wide, but old audit records remain readable. */
  async listForRequirement(userId: string, requirementId: string) {
    const requirement = await this.prisma.requirement.findUnique({ where: { id: requirementId }, select: { project: { select: { workspaceId: true } } } });
    if (!requirement) throw new NotFoundException('Requisito não encontrado');
    const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: requirement.project.workspaceId, userId } } });
    if (!member || !this.readRoles.includes(member.role)) throw new ForbiddenException('Você não tem permissão para esta ação');
    return this.prisma.aiSuggestion.findMany({ where: { requirementId }, orderBy: { createdAt: 'asc' } });
  }

  async persistDependencies(analysisId: string, response: unknown): Promise<number> {
    let parsed: DependencyResponse;
    try { parsed = DependencyResponseSchema.parse(response); } catch { throw new BadRequestException('Resposta do provider de IA inválida'); }
    const analysis = await this.prisma.dependencyAnalysis.findUnique({ where: { id: analysisId }, select: { projectId: true, status: true } });
    if (!analysis || analysis.status !== DependencyAnalysisStatus.PERSISTING) throw new ConflictException('Análise de dependências não está pronta para persistência');
    const ids = new Set<string>();
    const pairs = new Map<string, DependencyResponse['dependencies'][number]>();
    for (const item of parsed.dependencies) {
      if (item.sourceRequirementId === item.targetRequirementId) throw new BadRequestException('Uma dependência não pode apontar para a própria US');
      const key = `${item.sourceRequirementId}:${item.targetRequirementId}`;
      if (!pairs.has(key)) pairs.set(key, item);
      ids.add(item.sourceRequirementId); ids.add(item.targetRequirementId);
    }
    const requirements = await this.prisma.requirement.findMany({ where: { projectId: analysis.projectId, archivedAt: null, status: { in: [RequirementStatus.DRAFT, RequirementStatus.ACTIVE] } }, select: { id: true } });
    const requirementIds = new Set(requirements.map(item => item.id));
    if ([...ids].some(id => !requirementIds.has(id))) throw new BadRequestException('Dependências devem usar apenas US não arquivadas do projeto');
    const existing = pairs.size ? await this.prisma.requirementRelation.findMany({ where: { type: RelationType.DEPENDS_ON, OR: [...pairs.values()].map(item => ({ sourceId: item.sourceRequirementId, targetId: item.targetRequirementId })) }, select: { sourceId: true, targetId: true } }) : [];
    const dismissed = pairs.size ? await this.prisma.aiSuggestion.findMany({ where: { relationType: RelationType.DEPENDS_ON, status: AiSuggestionStatus.DISMISSED, OR: [...pairs.values()].map(item => ({ requirementId: item.sourceRequirementId, targetRequirementId: item.targetRequirementId })) }, select: { requirementId: true, targetRequirementId: true } }) : [];
    const blocked = new Set([...existing.map(x => `${x.sourceId}:${x.targetId}`), ...dismissed.map(x => `${x.requirementId}:${x.targetRequirementId}`)]);
    const data = [...pairs.entries()].filter(([key]) => !blocked.has(key)).map(([, item]) => ({ dependencyAnalysisId: analysisId, requirementId: item.sourceRequirementId, targetRequirementId: item.targetRequirementId, type: 'RELATION' as const, relationType: RelationType.DEPENDS_ON, confidence: item.confidence, justification: item.justification, status: AiSuggestionStatus.CONFIRMED }));
    // The linked-folder flow applies provider results directly. We still keep
    // confirmed rows as audit evidence, while a manually dismissed pair stays
    // a durable suppression for future passes.
    const bySource = new Map<string, typeof data>();
    data.forEach(item => bySource.set(item.requirementId, [...(bySource.get(item.requirementId) ?? []), item]));
    for (let index = 0; index < requirements.length; index += 1) {
      const sourceId = requirements[index].id;
      await this.prisma.$transaction(async tx => {
        const rows = bySource.get(sourceId);
        if (rows?.length) {
          await tx.aiSuggestion.createMany({ data: rows });
          for (const row of rows) await tx.requirementRelation.upsert({ where: { sourceId_targetId_type: { sourceId: row.requirementId, targetId: row.targetRequirementId!, type: RelationType.DEPENDS_ON } }, create: { sourceId: row.requirementId, targetId: row.targetRequirementId!, type: RelationType.DEPENDS_ON }, update: {} });
        }
        await tx.dependencyAnalysis.update({ where: { id: analysisId }, data: { processedRequirements: index + 1 } });
      });
    }
    return data.length;
  }

  private async decideOnce(userId: string, id: string, decision: 'CONFIRMED' | 'DISMISSED') {
    return this.prisma.$transaction(async tx => {
      const suggestion = await tx.aiSuggestion.findUnique({ where: { id }, include: { requirement: { include: { project: { select: { workspaceId: true } } } }, targetRequirement: true } });
      if (!suggestion) throw new NotFoundException('Sugestão de IA não encontrada');
      const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: suggestion.requirement.project.workspaceId, userId } } });
      if (!member || !this.editRoles.includes(member.role)) throw new ForbiddenException('Apenas owner ou editor pode decidir sugestões');
      if (suggestion.status !== AiSuggestionStatus.PENDING) return suggestion;
      if (!suggestion.dependencyAnalysisId || suggestion.type !== 'RELATION' || suggestion.relationType !== RelationType.DEPENDS_ON || !suggestion.targetRequirementId || !suggestion.targetRequirement) throw new BadRequestException('Somente sugestões de dependência podem ser decididas');
      if (decision === 'DISMISSED') return tx.aiSuggestion.update({ where: { id }, data: { status: 'DISMISSED', error: null } });
      const target = suggestion.targetRequirement;
      if (target.projectId !== suggestion.requirement.projectId || target.id === suggestion.requirementId || target.archivedAt || target.status === RequirementStatus.ARCHIVED) throw new BadRequestException('O alvo da sugestão não é uma US elegível do projeto');
      await tx.requirementRelation.upsert({ where: { sourceId_targetId_type: { sourceId: suggestion.requirementId, targetId: target.id, type: RelationType.DEPENDS_ON } }, create: { sourceId: suggestion.requirementId, targetId: target.id, type: RelationType.DEPENDS_ON }, update: {} });
      return tx.aiSuggestion.update({ where: { id }, data: { status: 'CONFIRMED', error: null } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  private async decide(userId: string, id: string, decision: 'CONFIRMED' | 'DISMISSED') { for (let attempt = 0; attempt < 3; attempt += 1) { try { return await this.decideOnce(userId, id, decision); } catch (error) { if ((error as { code?: string })?.code !== 'P2034' || attempt === 2) throw error; } } throw new Error('unreachable'); }
  async approve(userId: string, id: string) { return this.decide(userId, id, 'CONFIRMED'); }
  async dismissSuggestion(userId: string, id: string) { return this.decide(userId, id, 'DISMISSED'); }
}
