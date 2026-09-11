import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core/core.module';
import { RequirementsModule } from './requirements/requirements.module';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule, AuthModule, RequirementsModule] })
export class AppModule {}
