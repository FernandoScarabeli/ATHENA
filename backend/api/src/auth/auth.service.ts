import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { PrismaService } from "../core/prisma.service";
import { AuthRateLimitService } from "./auth-rate-limit.service";
import {
  createToken,
  normalizeEmail,
  safeReturnTo,
  tokenDigest,
} from "./auth.utils";
import { PasswordPolicyService } from "./password-policy.service";
import { TransactionalEmailService } from "./transactional-email.service";

type SafeUser = { id: string; email: string; name: string };
type SessionStore = Pick<PrismaService, "authSession">;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordPolicyService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly mail: TransactionalEmailService,
  ) {}

  private async createVerification(user: SafeUser, returnTo?: string) {
    const token = createToken();
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenDigest(token),
        returnTo: safeReturnTo(returnTo),
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
    await this.mail.sendVerification(user.email, token);
  }

  async register(
    email: string,
    name: string,
    password: string,
    termsAccepted: boolean,
    origin: string,
    returnTo?: string,
  ) {
    const normalized = normalizeEmail(email);
    await this.rateLimit.check(normalized, origin, "register");
    if (!termsAccepted)
      throw new BadRequestException(
        "Você precisa aceitar os termos e a política de privacidade.",
      );
    if (!name.trim())
      throw new BadRequestException("Informe seu nome completo.");
    await this.passwords.validate(password);
    const existing = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, name: true, verifiedAt: true },
    });
    if (existing) {
      if (!existing.verifiedAt)
        await this.createVerification(existing, returnTo);
      return;
    }
    try {
      const user = await this.prisma.user.create({
        data: {
          email: normalized,
          name: name.trim(),
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
          legalAcceptances: {
            create: {
              termsVersion: process.env.TERMS_VERSION ?? "1",
              privacyVersion: process.env.PRIVACY_VERSION ?? "1",
              origin,
            },
          },
        },
        select: { id: true, email: true, name: true },
      });
      await this.createVerification(user, returnTo);
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") return;
      throw error;
    }
  }

  async verify(rawToken: string) {
    const token = await this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash: tokenDigest(rawToken),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!token)
      throw new BadRequestException(
        "Este link de confirmação é inválido ou expirou.",
      );
    const now = new Date();
    const updated = await this.prisma.emailVerificationToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: now },
    });
    if (!updated.count)
      throw new BadRequestException(
        "Este link de confirmação é inválido ou expirou.",
      );
    await this.prisma.user.update({
      where: { id: token.userId },
      data: { verifiedAt: now },
    });
    return { returnTo: safeReturnTo(token.returnTo) };
  }

  async resendVerification(email: string, origin: string, returnTo?: string) {
    const normalized = normalizeEmail(email);
    await this.rateLimit.check(normalized, origin, "resend-verification");
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, name: true, verifiedAt: true },
    });
    if (user && !user.verifiedAt) await this.createVerification(user, returnTo);
  }

  async validateLogin(
    email: string,
    password: string,
    origin: string,
  ): Promise<SafeUser> {
    const normalized = normalizeEmail(email);
    await this.rateLimit.check(normalized, origin, "login");
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
    });
    if (
      !user ||
      !user.verifiedAt ||
      !(await argon2.verify(user.passwordHash, password))
    )
      throw new UnauthorizedException(
        "Não foi possível entrar com estes dados.",
      );
    return { id: user.id, email: user.email, name: user.name };
  }

  private async issueSession(
    user: SafeUser,
    persistent: boolean,
    store: SessionStore = this.prisma,
  ) {
    const id = randomUUID();
    const secret = createToken();
    const expiresAt = new Date(
      Date.now() + (persistent ? 30 : 1) * 24 * 60 * 60_000,
    );
    await store.authSession.create({
      data: {
        id,
        userId: user.id,
        refreshHash: tokenDigest(secret),
        persistent,
        expiresAt,
      },
    });
    return {
      access: this.jwt.sign(
        { sub: user.id, email: user.email, sid: id },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: "15m" },
      ),
      refresh: `${id}.${secret}`,
      persistent,
      sessionId: id,
    };
  }
  session(user: SafeUser, persistent: boolean) {
    return this.issueSession(user, persistent);
  }

  private refreshParts(value?: string) {
    const parts = (value ?? "").split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
    return { id: parts[0], secret: parts[1] };
  }

  async refresh(value?: string) {
    const refresh = this.refreshParts(value);
    if (!refresh) throw new UnauthorizedException("Sessão expirada.");
    const { id, secret } = refresh;
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.authSession.findFirst({
        where: {
          id,
          refreshHash: tokenDigest(secret),
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { verifiedAt: { not: null } },
        },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      if (!session) throw new UnauthorizedException("Sessão expirada.");
      const revoked = await tx.authSession.updateMany({
        where: {
          id: session.id,
          refreshHash: tokenDigest(secret),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (!revoked.count) throw new UnauthorizedException("Sessão expirada.");
      return this.issueSession(
        session.user,
        session.persistent,
        tx as SessionStore,
      );
    });
  }

  async requestReset(email: string, origin: string) {
    const normalized = normalizeEmail(email);
    await this.rateLimit.check(normalized, origin, "forgot-password");
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, verifiedAt: true },
    });
    if (!user?.verifiedAt) return;
    const token = createToken();
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenDigest(token),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    await this.mail.sendPasswordReset(user.email, token);
  }
  async reset(rawToken: string, password: string) {
    await this.passwords.validate(password);
    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: tokenDigest(rawToken),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!token)
      throw new BadRequestException(
        "Este link de redefinição é inválido ou expirou.",
      );
    const now = new Date();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (!consumed.count)
        throw new BadRequestException(
          "Este link de redefinição é inválido ou expirou.",
        );
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      });
      await tx.authSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }
  sessions(userId: string) {
    return this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, persistent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  }
  revoke(userId: string, id: string) {
    return this.prisma.authSession.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  logout(value?: string) {
    const refresh = this.refreshParts(value);
    if (!refresh) return Promise.resolve();
    const { id, secret } = refresh;
    return this.prisma.authSession.updateMany({
      where: { id, refreshHash: tokenDigest(secret), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
