import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { resolveAppOrigin } from '../common/public-origin';
import { PrismaService } from './prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Banco indisponível');
    }
  }

  @Get('app-config')
  appConfig() {
    const configured = process.env.APP_ORIGIN ?? process.env.WEB_ORIGIN?.split(',')[0];
    try {
      return { publicAppOrigin: resolveAppOrigin(configured, process.env.NODE_ENV === 'production') };
    } catch {
      throw new ServiceUnavailableException('A origem pública do app não está configurada corretamente.');
    }
  }
}
