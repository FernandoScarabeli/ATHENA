import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IntegrationKind } from '@prisma/client';

export class ConnectIntegrationDto {
  @IsEnum(IntegrationKind) kind!: IntegrationKind;
  /** Provider-specific secret fields. Never echoed by the API. */
  @IsObject() credentials!: Record<string, string>;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) accountLabel?: string;
}
