import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
export type AuthUser = { sub: string; email: string };
@Injectable() export class JwtCookieGuard implements CanActivate { constructor(private jwt: JwtService) {} canActivate(ctx: ExecutionContext) { const r = ctx.switchToHttp().getRequest<Request>(); const token = r.cookies?.athena_access; if (!token) throw new UnauthorizedException(); try { (r as any).user = this.jwt.verify<AuthUser>(token, { secret: process.env.JWT_ACCESS_SECRET }); return true; } catch { throw new UnauthorizedException('Sessão expirada'); } } }
export const userFrom = (r: Request): AuthUser => (r as any).user;
