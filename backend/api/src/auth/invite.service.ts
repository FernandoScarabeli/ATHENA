import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ProjectRole, WorkspaceRole } from "@prisma/client";
import { PrismaService } from "../core/prisma.service";
import { createToken, normalizeEmail, tokenDigest } from "./auth.utils";
import { TransactionalEmailService } from "./transactional-email.service";
import { requireProjectManagerOrOwner, requireWorkspaceOwner } from "../common/project-access";

const inviteRoles: WorkspaceRole[] = [
  WorkspaceRole.MANAGER,
  WorkspaceRole.EDITOR,
  WorkspaceRole.VIEWER,
];

@Injectable()
export class InviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: TransactionalEmailService,
  ) {}
  private async owner(userId: string, workspaceId: string) {
    try { await requireWorkspaceOwner(this.prisma, userId, workspaceId); }
    catch (error) { if (error instanceof ForbiddenException) throw new ForbiddenException("Você não tem permissão para esta ação"); throw error; }
  }
  private async projectManager(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true, archivedAt: true } });
    if (!project) throw new NotFoundException("Projeto não encontrado.");
    if (project.archivedAt) throw new NotFoundException("Este projeto está arquivado.");
    await requireProjectManagerOrOwner(this.prisma, userId, projectId);
    return project.workspaceId;
  }
  private async deliver(invite: {
    id: string;
    email: string;
    token: string;
    workspaceName: string;
  }) {
    try {
      await this.mail.sendWorkspaceInvite(
        invite.email,
        invite.workspaceName,
        invite.token,
        invite.id,
      );
      await this.prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: { deliveryError: null, lastSentAt: new Date() },
      });
    } catch {
      await this.prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: {
          deliveryError: "Não foi possível enviar o e-mail. Reenvie o convite.",
        },
      });
      throw new BadRequestException(
        "Não foi possível enviar o convite agora. Tente novamente.",
      );
    }
  }
  private async deliverProject(invite: { id: string; email: string; token: string; projectName: string }) {
    try {
      await this.mail.sendProjectInvite(invite.email, invite.projectName, invite.token, invite.id);
      await this.prisma.projectInvite.update({ where: { id: invite.id }, data: { deliveryError: null, lastSentAt: new Date() } });
    } catch {
      await this.prisma.projectInvite.update({ where: { id: invite.id }, data: { deliveryError: "Não foi possível enviar o e-mail. Reenvie o convite." } });
      throw new BadRequestException("Não foi possível enviar o convite agora. Tente novamente.");
    }
  }
  async create(
    userId: string,
    workspaceId: string,
    email: string,
    role: WorkspaceRole,
  ) {
    const normalized = normalizeEmail(email);
    if (!inviteRoles.includes(role))
      throw new BadRequestException(
        "Convites de workspace só podem conceder GERÊNCIA, EDITOR ou LEITOR.",
      );
    const token = createToken();
    const now = new Date();
    const prepared = await this.prisma.$transaction(async (tx) => {
      const owner = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (!owner || owner.role !== WorkspaceRole.OWNER)
        throw new ForbiddenException("Você não tem permissão para esta ação");

      const [workspace, membership] = await Promise.all([
        tx.workspace.findUnique({
          where: { id: workspaceId },
          select: { id: true, name: true },
        }),
        tx.workspaceMember.findFirst({
          where: { workspaceId, user: { email: normalized } },
        }),
      ]);
      if (!workspace) throw new NotFoundException("Workspace não encontrado.");
      if (membership)
        throw new ConflictException("Esta pessoa já participa do workspace.");

      await tx.workspaceInvite.updateMany({
        where: {
          workspaceId,
          email: normalized,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      const invite = await tx.workspaceInvite.create({
        data: {
          workspaceId,
          email: normalized,
          role,
          senderId: userId,
          tokenHash: tokenDigest(token),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        },
      });

      return { invite, workspaceName: workspace.name };
    });
    await this.deliver({
      id: prepared.invite.id,
      email: normalized,
      token,
      workspaceName: prepared.workspaceName,
    });
    return this.publicInvite(prepared.invite);
  }
  async list(userId: string, workspaceId: string) {
    await this.owner(userId, workspaceId);
    return this.prisma.workspaceInvite.findMany({
      where: { workspaceId },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        deliveryError: true,
        lastSentAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
  async resend(userId: string, workspaceId: string, inviteId: string) {
    await this.owner(userId, workspaceId);
    const current = await this.prisma.workspaceInvite.findFirst({
      where: {
        id: inviteId,
        workspaceId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { workspace: { select: { name: true } } },
    });
    if (!current)
      throw new NotFoundException("Convite pendente não encontrado.");
    const token = createToken();
    await this.prisma.workspaceInvite.update({
      where: { id: current.id },
      data: {
        tokenHash: tokenDigest(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      },
    });
    await this.deliver({
      id: current.id,
      email: current.email,
      token,
      workspaceName: current.workspace.name,
    });
    return { ok: true };
  }
  async revoke(userId: string, workspaceId: string, inviteId: string) {
    await this.owner(userId, workspaceId);
    await this.prisma.workspaceInvite.updateMany({
      where: { id: inviteId, workspaceId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
  async createProject(userId: string, projectId: string, email: string, role: ProjectRole) {
    const normalized = normalizeEmail(email);
    if (![ProjectRole.EDITOR, ProjectRole.VIEWER].includes(role)) throw new BadRequestException("Convites só podem conceder EDITOR ou VIEWER.");
    const token = createToken();
    const now = new Date();
    const prepared = await this.prisma.$transaction(async tx => {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, workspaceId: true, archivedAt: true } });
      if (!project) throw new NotFoundException("Projeto não encontrado.");
      if (project.archivedAt) throw new NotFoundException("Este projeto está arquivado.");
      const manager = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: project.workspaceId, userId } } });
      if (!manager || (manager.role !== WorkspaceRole.OWNER && manager.role !== WorkspaceRole.MANAGER)) throw new ForbiddenException("Você não tem permissão para esta ação");
      const workspace = await tx.workspace.findUnique({ where: { id: project.workspaceId }, select: { archivedAt: true } });
      if (!workspace || workspace.archivedAt) throw new NotFoundException("Este workspace está arquivado.");
      const [workspaceMember, projectMember] = await Promise.all([
        tx.workspaceMember.findFirst({ where: { workspaceId: project.workspaceId, user: { email: normalized } }, select: { userId: true } }),
        tx.projectMember.findFirst({ where: { projectId, user: { email: normalized } }, select: { userId: true } }),
      ]);
      if (workspaceMember || projectMember) throw new ConflictException("Esta pessoa já tem acesso ao projeto.");
      await tx.projectInvite.updateMany({ where: { projectId, email: normalized, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } });
      const invite = await tx.projectInvite.create({ data: { projectId, email: normalized, role, senderId: userId, tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) } });
      return { invite, projectName: project.name };
    });
    await this.deliverProject({ id: prepared.invite.id, email: normalized, token, projectName: prepared.projectName });
    return this.publicProjectInvite(prepared.invite);
  }
  async listProject(userId: string, projectId: string) {
    await this.projectManager(userId, projectId);
    return this.prisma.projectInvite.findMany({ where: { projectId }, select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, deliveryError: true, lastSentAt: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  }
  async resendProject(userId: string, projectId: string, inviteId: string) {
    await this.projectManager(userId, projectId);
    const current = await this.prisma.projectInvite.findFirst({ where: { id: inviteId, projectId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, include: { project: { select: { name: true } } } });
    if (!current) throw new NotFoundException("Convite pendente não encontrado.");
    const token = createToken();
    await this.prisma.projectInvite.update({ where: { id: current.id }, data: { tokenHash: tokenDigest(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) } });
    await this.deliverProject({ id: current.id, email: current.email, token, projectName: current.project.name });
    return { ok: true };
  }
  async revokeProject(userId: string, projectId: string, inviteId: string) {
    await this.projectManager(userId, projectId);
    await this.prisma.projectInvite.updateMany({ where: { id: inviteId, projectId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }
  async resolve(rawToken: string) {
    const invite = await this.prisma.workspaceInvite.findFirst({
      where: {
        tokenHash: tokenDigest(rawToken),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { workspace: { select: { name: true } } },
    });
    if (invite) return { workspaceName: invite.workspace.name, role: invite.role, scope: "WORKSPACE" as const, workspaceId: invite.workspaceId };
    const projectInvite = await this.prisma.projectInvite.findFirst({
      where: { tokenHash: tokenDigest(rawToken), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { project: { select: { id: true, name: true, workspaceId: true, workspace: { select: { name: true } } } } },
    });
    if (!projectInvite) throw new NotFoundException("Este convite é inválido ou expirou.");
    return { workspaceName: projectInvite.project.workspace.name, projectName: projectInvite.project.name, projectId: projectInvite.projectId, workspaceId: projectInvite.project.workspaceId, role: projectInvite.role, scope: "PROJECT" as const };
  }
  async accept(userId: string, email: string, rawToken: string) {
    const invite = await this.prisma.workspaceInvite.findFirst({
      where: {
        tokenHash: tokenDigest(rawToken),
        OR: [
          { acceptedAt: { not: null } },
          { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        ],
      },
    });
    if (invite) {
      if (normalizeEmail(email) !== invite.email) throw new ForbiddenException("Não foi possível aceitar este convite.");
      if (invite.acceptedAt) return { workspaceId: invite.workspaceId, ok: true };
      await this.prisma.$transaction(async (tx) => {
        const active = await tx.workspaceInvite.findFirst({ where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
        if (!active) throw new BadRequestException("Este convite é inválido ou expirou.");
        await tx.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: active.workspaceId, userId } }, create: { workspaceId: active.workspaceId, userId, role: active.role }, update: {} });
        await tx.projectMember.deleteMany({ where: { userId, project: { workspaceId: active.workspaceId } } });
        await tx.workspaceInvite.update({ where: { id: active.id }, data: { acceptedAt: new Date(), recipientId: userId } });
      });
      return { workspaceId: invite.workspaceId, ok: true };
    }
    const projectInvite = await this.prisma.projectInvite.findFirst({ where: { tokenHash: tokenDigest(rawToken), OR: [{ acceptedAt: { not: null } }, { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }] }, include: { project: { select: { workspaceId: true } } } });
    if (!projectInvite) throw new BadRequestException("Este convite é inválido ou expirou.");
    if (normalizeEmail(email) !== projectInvite.email) throw new ForbiddenException("Não foi possível aceitar este convite.");
    if (projectInvite.acceptedAt) return { workspaceId: projectInvite.project.workspaceId, projectId: projectInvite.projectId, ok: true };
    await this.prisma.$transaction(async (tx) => {
      const active = await tx.projectInvite.findFirst({ where: { id: projectInvite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (!active)
        throw new BadRequestException("Este convite é inválido ou expirou.");
      const workspaceMember = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: projectInvite.project.workspaceId, userId } } });
      if (!workspaceMember) await tx.projectMember.upsert({ where: { projectId_userId: { projectId: active.projectId, userId } }, create: { projectId: active.projectId, userId, role: active.role }, update: { role: active.role } });
      await tx.projectInvite.update({
        where: { id: active.id },
        data: { acceptedAt: new Date(), recipientId: userId },
      });
    });
    return { workspaceId: projectInvite.project.workspaceId, projectId: projectInvite.projectId, ok: true };
  }
  private publicInvite(invite: {
    id: string;
    role: WorkspaceRole;
    expiresAt: Date;
  }) {
    return { id: invite.id, role: invite.role, expiresAt: invite.expiresAt };
  }
  private publicProjectInvite(invite: { id: string; role: ProjectRole; expiresAt: Date }) {
    return { id: invite.id, role: invite.role, expiresAt: invite.expiresAt };
  }
}
