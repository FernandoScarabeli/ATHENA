import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../core/prisma.service";

/** Five attempts per action/e-mail or action/IP over 15 minutes. Never stores credentials or tokens. */
@Injectable()
export class AuthRateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async check(email: string, origin: string, action: string) {
    const since = new Date(Date.now() - 15 * 60_000);
    const count = await this.prisma.authAttempt.count({
      where: { action, createdAt: { gte: since }, OR: [{ email }, { origin }] },
    });
    if (count >= 5)
      throw new HttpException(
        "Não foi possível concluir esta ação agora. Tente novamente mais tarde.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    await this.prisma.authAttempt.create({ data: { email, origin, action } });
  }
}
