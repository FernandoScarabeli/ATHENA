import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { PrismaService } from "../core/prisma.service";
export type AuthUser = { sub: string; email: string; sid: string };
@Injectable()
export class JwtCookieGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const request = ctx.switchToHttp().getRequest<Request>();
    const token = request.cookies?.athena_access;
    if (!token) throw new UnauthorizedException("Sessão expirada.");
    try {
      const user = this.jwt.verify<AuthUser>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      if (!user.sid) throw new Error("missing session");
      const session = await this.prisma.authSession.findFirst({
        where: {
          id: user.sid,
          userId: user.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { verifiedAt: { not: null } },
        },
        select: { id: true },
      });
      if (!session) throw new Error("revoked session");
      (request as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException("Sessão expirada.");
    }
  }
}
export const userFrom = (r: Request): AuthUser => (r as any).user;
