import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ProjectRole, WorkspaceRole } from "@prisma/client";
import { PrismaService } from "../core/prisma.service";

export type EffectiveProjectRole = WorkspaceRole | ProjectRole | null;

/** Workspace grants take precedence over project membership, including for Owners. */
export async function effectiveProjectAccess(
  prisma: PrismaService,
  userId: string,
  projectId: string,
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundException("Projeto não encontrado");
  if (project.archivedAt) throw new NotFoundException("Este projeto está arquivado");
  const workspace = await prisma.workspace.findUnique({ where: { id: project.workspaceId }, select: { archivedAt: true } });
  if (!workspace || workspace.archivedAt) throw new NotFoundException("Este workspace está arquivado");

  const workspaceMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: project.workspaceId, userId } },
  });
  if (workspaceMember) {
    return { project, role: workspaceMember.role as EffectiveProjectRole, scope: "WORKSPACE" as const };
  }

  const projectMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return {
    project,
    role: (projectMember?.role ?? null) as EffectiveProjectRole,
    scope: projectMember ? "PROJECT" as const : null,
  };
}

export async function requireProjectAccess(
  prisma: PrismaService,
  userId: string,
  projectId: string,
  edit = false,
) {
  const access = await effectiveProjectAccess(prisma, userId, projectId);
  const readable = access.role !== null;
  const effectiveRole = String(access.role ?? "");
  const editable = effectiveRole === "OWNER" || effectiveRole === "MANAGER" || effectiveRole === "EDITOR";
  if (!readable || (edit && !editable)) {
    throw new ForbiddenException("Você não tem permissão para este projeto");
  }
  return access;
}

export async function requireWorkspaceOwner(prisma: PrismaService, userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (membership?.role !== WorkspaceRole.OWNER) {
    throw new ForbiddenException("Você não tem permissão para esta ação");
  }
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { archivedAt: true } });
  if (!workspace || workspace.archivedAt) throw new NotFoundException("Este workspace está arquivado");
  return membership;
}

export async function requireWorkspaceManagerOrOwner(prisma: PrismaService, userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: { select: { archivedAt: true } } },
  });
  if (!membership || (membership.role !== WorkspaceRole.OWNER && membership.role !== WorkspaceRole.MANAGER)) {
    throw new ForbiddenException("Você não tem permissão para esta ação");
  }
  if (!membership.workspace || membership.workspace.archivedAt) {
    throw new NotFoundException("Este workspace está arquivado");
  }
  return membership;
}

export async function requireProjectManagerOrOwner(prisma: PrismaService, userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, workspaceId: true, archivedAt: true } });
  if (!project) throw new NotFoundException("Projeto não encontrado");
  await requireWorkspaceManagerOrOwner(prisma, userId, project.workspaceId);
  return project;
}
