import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { WorkspaceRole } from "@prisma/client";
import { PrismaService } from "../core/prisma.service";
import { createToken, normalizeEmail, tokenDigest } from "./auth.utils";
import { TransactionalEmailService } from "./transactional-email.service";

const inviteRoles: WorkspaceRole[] = [
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
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member || member.role !== WorkspaceRole.OWNER)
      throw new ForbiddenException("Você não tem permissão para esta ação");
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
  async create(
    userId: string,
    workspaceId: string,
    email: string,
    role: WorkspaceRole,
  ) {
    const normalized = normalizeEmail(email);
    if (!inviteRoles.includes(role))
      throw new BadRequestException(
        "Convites só podem conceder EDITOR ou VIEWER.",
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
    if (!invite)
      throw new NotFoundException("Este convite é inválido ou expirou.");
    return { workspaceName: invite.workspace.name, role: invite.role };
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
    if (!invite)
      throw new BadRequestException("Este convite é inválido ou expirou.");
    if (normalizeEmail(email) !== invite.email)
      throw new ForbiddenException("Não foi possível aceitar este convite.");
    if (invite.acceptedAt) return { workspaceId: invite.workspaceId, ok: true };
    await this.prisma.$transaction(async (tx) => {
      const active = await tx.workspaceInvite.findFirst({
        where: {
          id: invite.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!active)
        throw new BadRequestException("Este convite é inválido ou expirou.");
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: { workspaceId: active.workspaceId, userId },
        },
        create: { workspaceId: active.workspaceId, userId, role: active.role },
        update: {},
      });
      await tx.workspaceInvite.update({
        where: { id: active.id },
        data: { acceptedAt: new Date(), recipientId: userId },
      });
    });
    return { workspaceId: invite.workspaceId, ok: true };
  }
  private publicInvite(invite: {
    id: string;
    role: WorkspaceRole;
    expiresAt: Date;
  }) {
    return { id: invite.id, role: invite.role, expiresAt: invite.expiresAt };
  }
}
