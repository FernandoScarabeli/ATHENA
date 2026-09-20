import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { WorkspaceRole } from "@prisma/client";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { Request, Response } from "express";
import { JwtCookieGuard, userFrom } from "../common/auth";
import { PrismaService } from "../core/prisma.service";
import { AuthService } from "./auth.service";
import { InviteService } from "./invite.service";

class CredentialsDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
  @IsBoolean() @IsOptional() remember?: boolean;
  @IsOptional() @IsString() returnTo?: string;
}

class RegisterDto extends CredentialsDto {
  @IsString() @MinLength(2) name!: string;
  @IsBoolean() termsAccepted!: boolean;
  @IsString() passwordConfirmation!: string;
}

class TokenDto {
  @IsString() token!: string;
}
class EmailDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() returnTo?: string;
}
class ResetDto extends TokenDto {
  @IsString() password!: string;
  @IsString() passwordConfirmation!: string;
}
class InviteDto {
  @IsEmail() email!: string;
  @IsIn([WorkspaceRole.EDITOR, WorkspaceRole.VIEWER]) role!: WorkspaceRole;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  private ip(request: Request) {
    return request.ip ?? "unknown";
  }

  private cookieBase() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
    };
  }

  private setCookies(
    response: Response,
    tokens: { access: string; refresh: string; persistent: boolean },
  ) {
    const base = this.cookieBase();
    response.cookie("athena_access", tokens.access, {
      ...base,
      maxAge: 15 * 60_000,
    });
    response.cookie(
      "athena_refresh",
      tokens.refresh,
      tokens.persistent ? { ...base, maxAge: 30 * 24 * 60 * 60_000 } : base,
    );
  }

  private clearCookies(response: Response) {
    const base = this.cookieBase();
    response.clearCookie("athena_access", base);
    response.clearCookie("athena_refresh", base);
  }

  @Post("register")
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body() dto: RegisterDto, @Req() request: Request) {
    if (dto.password !== dto.passwordConfirmation)
      throw new BadRequestException("As senhas precisam coincidir.");
    await this.auth.register(
      dto.email,
      dto.name,
      dto.password,
      dto.termsAccepted,
      this.ip(request),
      dto.returnTo,
    );
    return { ok: true };
  }

  @Post("login")
  async login(
    @Body() dto: CredentialsDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.validateLogin(
      dto.email,
      dto.password,
      this.ip(request),
    );
    this.setCookies(
      response,
      await this.auth.session(user, Boolean(dto.remember)),
    );
    return user;
  }

  @Post("verify-email") verify(@Body() dto: TokenDto) {
    return this.auth.verify(dto.token);
  }

  @Post("resend-verification")
  @HttpCode(HttpStatus.ACCEPTED)
  async resend(@Body() dto: EmailDto, @Req() request: Request) {
    await this.auth.resendVerification(
      dto.email,
      this.ip(request),
      dto.returnTo,
    );
    return { ok: true };
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  async forgot(@Body() dto: EmailDto, @Req() request: Request) {
    await this.auth.requestReset(dto.email, this.ip(request));
    return { ok: true };
  }

  @Post("reset-password")
  async reset(@Body() dto: ResetDto) {
    if (dto.password !== dto.passwordConfirmation)
      throw new BadRequestException("As senhas precisam coincidir.");
    await this.auth.reset(dto.token, dto.password);
    return { ok: true };
  }

  @Post("refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.setCookies(
      response,
      await this.auth.refresh(request.cookies?.athena_refresh),
    );
    return { ok: true };
  }

  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.cookies?.athena_refresh);
    this.clearCookies(response);
    return { ok: true };
  }

  @UseGuards(JwtCookieGuard)
  @Get("me")
  me(@Req() request: Request) {
    return this.prisma.user.findUnique({
      where: { id: userFrom(request).sub },
      select: { id: true, email: true, name: true, verifiedAt: true },
    });
  }

  @UseGuards(JwtCookieGuard)
  @Get("sessions")
  sessions(@Req() request: Request) {
    return this.auth.sessions(userFrom(request).sub);
  }

  @UseGuards(JwtCookieGuard)
  @Delete("sessions/:id")
  async revoke(@Req() request: Request, @Param("id") id: string) {
    await this.auth.revoke(userFrom(request).sub, id);
    return { ok: true };
  }
}

@Controller()
export class InviteController {
  constructor(private readonly invites: InviteService) {}

  @UseGuards(JwtCookieGuard)
  @Post("workspaces/:workspaceId/invites")
  create(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Body() dto: InviteDto,
  ) {
    return this.invites.create(
      userFrom(request).sub,
      workspaceId,
      dto.email,
      dto.role,
    );
  }

  @UseGuards(JwtCookieGuard)
  @Get("workspaces/:workspaceId/invites")
  list(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    return this.invites.list(userFrom(request).sub, workspaceId);
  }

  @UseGuards(JwtCookieGuard)
  @Post("workspaces/:workspaceId/invites/:id/resend")
  resend(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
  ) {
    return this.invites.resend(userFrom(request).sub, workspaceId, id);
  }

  @UseGuards(JwtCookieGuard)
  @Delete("workspaces/:workspaceId/invites/:id")
  revoke(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
  ) {
    return this.invites.revoke(userFrom(request).sub, workspaceId, id);
  }

  @Get("invites/resolve")
  resolve(@Query("token") token?: string) {
    if (!token) throw new BadRequestException("Convite inválido.");
    return this.invites.resolve(token);
  }

  @UseGuards(JwtCookieGuard)
  @Post("invites/accept")
  accept(@Req() request: Request, @Body() dto: TokenDto) {
    const user = userFrom(request);
    return this.invites.accept(user.sub, user.email, dto.token);
  }
}
