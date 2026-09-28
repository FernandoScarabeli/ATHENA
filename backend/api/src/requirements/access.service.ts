import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AccessRequestStatus, AccessScope, ProjectRole, WorkspaceRole } from "@prisma/client";
import { PrismaService } from "../core/prisma.service";
import { effectiveProjectAccess, requireProjectManagerOrOwner, requireWorkspaceManagerOrOwner, requireWorkspaceOwner } from "../common/project-access";
import { TransactionalEmailService } from "../auth/transactional-email.service";

const decisionRoles: ProjectRole[] = [ProjectRole.EDITOR, ProjectRole.VIEWER];

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);
  constructor(private readonly prisma: PrismaService, private readonly mail: TransactionalEmailService) {}

  async requestProjectAccess(userId: string, projectId: string) {
    const access = await effectiveProjectAccess(this.prisma, userId, projectId);
    if (access.role) return { status: "ALREADY_HAS_ACCESS" as const, scope: access.scope, projectId };
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, include: { workspace: { select: { name: true } } } });
    if (!project) throw new NotFoundException("Projeto não encontrado.");
    const pending = await this.prisma.accessRequest.findFirst({ where: { projectId, requesterId: userId, status: AccessRequestStatus.PENDING, activeKey: "PENDING" }, include: this.requestInclude });
    if (pending) return { status: AccessRequestStatus.PENDING, request: pending };

    let request;
    try {
      request = await this.prisma.$transaction(async tx => {
        const created = await tx.accessRequest.create({ data: { projectId, workspaceId: project.workspaceId, requesterId: userId }, include: this.requestInclude });
        const managers = await tx.workspaceMember.findMany({ where: { workspaceId: project.workspaceId, role: { in: [WorkspaceRole.OWNER, WorkspaceRole.MANAGER] } }, select: { userId: true } });
        if (!managers.length) throw new ConflictException("Este workspace não tem alguém da equipe de gestão disponível para decidir o pedido.");
        await tx.notification.createMany({ data: managers.map(manager => ({ userId: manager.userId, type: "ACCESS_REQUEST", accessRequestId: created.id })) });
        return { created, managers };
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2002") throw error;
      const existing = await this.prisma.accessRequest.findFirst({ where: { projectId, requesterId: userId, status: AccessRequestStatus.PENDING, activeKey: "PENDING" }, include: this.requestInclude });
      if (existing) return { status: AccessRequestStatus.PENDING, request: existing };
      throw error;
    }
    const requester = request.created.requester;
    const deliveries = await Promise.allSettled(request.managers.map(async manager => {
      const recipient = await this.prisma.user.findUnique({ where: { id: manager.userId }, select: { email: true } });
      if (recipient) await this.mail.sendAccessRequestNotice(recipient.email, requester.name, project.name, projectId, request.created.id, manager.userId);
    }));
    deliveries.forEach((delivery, index) => {
      if (delivery.status === "rejected") {
        const managerId = request.managers[index]?.userId ?? "unknown";
        const message = delivery.reason instanceof Error ? delivery.reason.message : "unknown error";
        this.logger.warn(`Access request email delivery failed for request ${request.created.id} manager ${managerId}: ${message}`);
      }
    });
    return { status: AccessRequestStatus.PENDING, request: request.created };
  }

  async listMine(userId: string) {
    return this.prisma.accessRequest.findMany({ where: { requesterId: userId }, include: this.requestInclude, orderBy: { createdAt: "desc" } });
  }

  async listWorkspaceRequests(userId: string, workspaceId: string) {
    await requireWorkspaceOwner(this.prisma, userId, workspaceId);
    return this.prisma.accessRequest.findMany({ where: { workspaceId }, include: this.requestInclude, orderBy: { createdAt: "desc" } });
  }

  async listProjectRequests(userId: string, projectId: string) {
    const project = await requireProjectManagerOrOwner(this.prisma, userId, projectId);
    if (project.archivedAt) throw new NotFoundException("Este projeto está arquivado");
    return this.prisma.accessRequest.findMany({ where: { projectId }, include: this.requestInclude, orderBy: { createdAt: "desc" } });
  }

  async listProjectMembers(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (!project) throw new NotFoundException("Projeto não encontrado.");
    const authorizedProject = await requireProjectManagerOrOwner(this.prisma, userId, projectId);
    if (authorizedProject.archivedAt) throw new NotFoundException("Este projeto está arquivado");
    const [workspaceMembers, projectMembers] = await Promise.all([
      this.prisma.workspaceMember.findMany({ where: { workspaceId: project.workspaceId }, orderBy: { user: { name: "asc" } }, select: { role: true, user: { select: { id: true, name: true, email: true } } } }),
      this.prisma.projectMember.findMany({ where: { projectId }, orderBy: { user: { name: "asc" } }, select: { role: true, user: { select: { id: true, name: true, email: true } } } }),
    ]);
    return [
      ...workspaceMembers.map(row => ({ scope: "WORKSPACE" as const, role: row.role, user: row.user })),
      ...projectMembers.map(row => ({ scope: "PROJECT" as const, role: row.role, user: row.user })),
    ];
  }

  async updateProjectMember(userId: string, projectId: string, targetUserId: string, role: ProjectRole) {
    if (!decisionRoles.includes(role)) throw new BadRequestException("O papel deve ser EDITOR ou VIEWER.");
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (!project) throw new NotFoundException("Projeto não encontrado.");
    const authorizedProject = await requireProjectManagerOrOwner(this.prisma, userId, projectId);
    if (authorizedProject.archivedAt) throw new NotFoundException("Este projeto está arquivado");
    const membership = await this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: targetUserId } } });
    if (!membership) throw new NotFoundException("Membro do projeto não encontrado.");
    return this.prisma.projectMember.update({ where: { projectId_userId: { projectId, userId: targetUserId } }, data: { role } });
  }

  async removeProjectMember(userId: string, projectId: string, targetUserId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
    if (!project) throw new NotFoundException("Projeto não encontrado.");
    const authorizedProject = await requireProjectManagerOrOwner(this.prisma, userId, projectId);
    if (authorizedProject.archivedAt) throw new NotFoundException("Este projeto está arquivado");
    const removed = await this.prisma.projectMember.deleteMany({ where: { projectId, userId: targetUserId } });
    if (!removed.count) throw new NotFoundException("Membro do projeto não encontrado.");
    return { ok: true };
  }

  async decide(userId: string, requestId: string, approve: boolean, scope?: AccessScope, role?: ProjectRole) {
    if (approve && (!scope || !role || !decisionRoles.includes(role))) throw new BadRequestException("Escolha o escopo e o papel para aprovar o pedido.");
    const current = await this.prisma.accessRequest.findUnique({ where: { id: requestId }, include: this.requestInclude });
    if (!current) throw new NotFoundException("Pedido de acesso não encontrado.");
    const authorizedProject = await requireProjectManagerOrOwner(this.prisma, userId, current.projectId);
    if (authorizedProject.archivedAt) throw new NotFoundException("Este projeto está arquivado");
    if (authorizedProject.workspaceId !== current.workspaceId) throw new ConflictException("O pedido de acesso não corresponde ao workspace atual do projeto.");
    const membership = await requireWorkspaceManagerOrOwner(this.prisma, userId, current.workspaceId);
    if (membership.role === WorkspaceRole.MANAGER && approve && scope !== AccessScope.PROJECT) {
      throw new ForbiddenException("Gerência só pode conceder acesso direto ao projeto");
    }
    const status = approve ? AccessRequestStatus.APPROVED : AccessRequestStatus.DENIED;
    const decidedAt = new Date();
    const request = await this.prisma.$transaction(async tx => {
      const changed = await tx.accessRequest.updateMany({ where: { id: requestId, status: AccessRequestStatus.PENDING, activeKey: "PENDING" }, data: { status, activeKey: approve ? null : null, scope: approve ? scope : null, role: approve ? role : null, decidedById: userId, decidedAt } });
      if (changed.count !== 1) throw new ConflictException("Este pedido já recebeu uma decisão.");
      if (approve && scope === AccessScope.WORKSPACE && role) {
        const workspaceRole = role === ProjectRole.EDITOR ? WorkspaceRole.EDITOR : WorkspaceRole.VIEWER;
        const existing = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: current.workspaceId, userId: current.requesterId } } });
        if (existing?.role !== WorkspaceRole.OWNER) await tx.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: current.workspaceId, userId: current.requesterId } }, create: { workspaceId: current.workspaceId, userId: current.requesterId, role: workspaceRole }, update: { role: workspaceRole } });
        await tx.projectMember.deleteMany({ where: { userId: current.requesterId, project: { workspaceId: current.workspaceId } } });
      } else if (approve && role) {
        const workspaceMember = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: current.workspaceId, userId: current.requesterId } } });
        if (!workspaceMember) await tx.projectMember.upsert({ where: { projectId_userId: { projectId: current.projectId, userId: current.requesterId } }, create: { projectId: current.projectId, userId: current.requesterId, role }, update: { role } });
      }
      await tx.notification.create({ data: { userId: current.requesterId, type: "ACCESS_DECISION", accessRequestId: current.id } });
      return tx.accessRequest.findUniqueOrThrow({ where: { id: current.id }, include: this.requestInclude });
    });
    try {
      await this.mail.sendAccessRequestDecision(current.requester.email, current.project.name, current.workspace.name, current.projectId, status, request.scope, request.role, current.id);
    } catch (error) {
      this.logger.warn(`Access decision email delivery failed for request ${current.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    return request;
  }

  private requestInclude = {
    requester: { select: { id: true, name: true, email: true } },
    project: { select: { id: true, name: true, key: true } },
    workspace: { select: { id: true, name: true } },
    decidedBy: { select: { id: true, name: true } },
  } as const;
}
