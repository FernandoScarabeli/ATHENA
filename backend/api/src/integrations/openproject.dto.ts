import { IsInt, IsObject, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class OpenProjectConnectDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(500) instanceUrl!: string;
  @IsString() @MinLength(8) @MaxLength(500) apiToken!: string;
}

export class OpenProjectProjectQueryDto {
  @Type(() => Number) @IsInt() @Min(1) projectId!: number;
}

export class OpenProjectFormDto {
  @Type(() => Number) @IsInt() @Min(1) projectId!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) typeId?: number;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}

export class IntegrationMappingDto {
  @IsString() @MinLength(1) @MaxLength(100) connectionId!: string;
  @IsString() @MinLength(1) @MaxLength(80) resourceKind!: string;
  @IsString() @MinLength(1) @MaxLength(300) externalId!: string;
  @IsString() @MinLength(1) @MaxLength(300) externalName!: string;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}
