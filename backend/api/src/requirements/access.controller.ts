import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AccessScope, ProjectRole } from "@prisma/client";
import { IsIn, IsOptional } from "class-validator";
import { Request } from "express";
import { JwtCookieGuard, userFrom } from "../common/auth";
import { AccessService } from "./access.service";
import { RequirementsService } from "./requirements.service";

class AccessDecisionDto {
  @IsIn([AccessScope.PROJECT, AccessScope.WORKSPACE]) @IsOptional() scope?: AccessScope;
  @IsIn([ProjectRole.EDITOR, ProjectRole.VIEWER]) @IsOptional() role?: ProjectRole;
}

@UseGuards(JwtCookieGuard)
@Controller()
export class AccessController {
  constructor(private readonly access: AccessService, private readonly requirements: RequirementsService) {}

  @Post("projects/:projectId/access-requests")
  request(@Req() request: Request, @Param("projectId") projectId: string) {
    return this.access.requestProjectAccess(userFrom(request).sub, projectId);
  }

  @Get("access-requests/mine")
  mine(@Req() request: Request) {
    return this.access.listMine(userFrom(request).sub);
  }

  @Get("workspaces/:workspaceId/access-requests")
  workspaceRequests(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    return this.access.listWorkspaceRequests(userFrom(request).sub, workspaceId);
  }

  @Get("projects/:projectId/access-requests")
  projectRequests(@Req() request: Request, @Param("projectId") projectId: string) {
    return this.access.listProjectRequests(userFrom(request).sub, projectId);
  }

  @Post("access-requests/:id/approve")
  approve(@Req() request: Request, @Param("id") id: string, @Body() dto: AccessDecisionDto) {
    return this.access.decide(userFrom(request).sub, id, true, dto.scope, dto.role);
  }

  @Post("access-requests/:id/deny")
  deny(@Req() request: Request, @Param("id") id: string) {
    return this.access.decide(userFrom(request).sub, id, false);
  }

  @Get("projects/:projectId/members")
  projectMembers(@Req() request: Request, @Param("projectId") projectId: string) {
    return this.access.listProjectMembers(userFrom(request).sub, projectId);
  }

  @Patch("projects/:projectId/members/:memberUserId")
  updateProjectMember(@Req() request: Request, @Param("projectId") projectId: string, @Param("memberUserId") memberUserId: string, @Body() dto: AccessDecisionDto) {
    if (!dto.role) throw new BadRequestException("O papel do projeto é obrigatório.");
    return this.access.updateProjectMember(userFrom(request).sub, projectId, memberUserId, dto.role);
  }

  @Delete("projects/:projectId/members/:memberUserId")
  removeProjectMember(@Req() request: Request, @Param("projectId") projectId: string, @Param("memberUserId") memberUserId: string) {
    return this.access.removeProjectMember(userFrom(request).sub, projectId, memberUserId);
  }

  @Get("projects/:projectId/participants")
  projectParticipants(@Req() request: Request, @Param("projectId") projectId: string) {
    return this.requirements.projectParticipants(userFrom(request).sub, projectId);
  }
}
