import { Global, Module } from '@nestjs/common'; import { PrismaService } from './prisma.service'; import { HealthController } from './health.controller';
@Global() @Module({ providers: [PrismaService], exports: [PrismaService], controllers: [HealthController] }) export class CoreModule {}
