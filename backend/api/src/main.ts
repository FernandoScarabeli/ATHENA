import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpErrorFilter } from './common/http-error.filter';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    for (const key of ['APP_ORIGIN', 'RESEND_API_KEY', 'RESEND_FROM', 'TERMS_URL', 'PRIVACY_URL', 'TERMS_VERSION', 'PRIVACY_VERSION']) {
      if (!process.env[key]) throw new Error(`${key} é obrigatório em produção.`);
    }
  }
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api'); app.use(helmet()); app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); app.useGlobalFilters(new HttpErrorFilter());
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('ATHENA API').setVersion('1').addCookieAuth().build()));
  await app.listen(Number(process.env.API_PORT ?? 3000));
}
bootstrap();
