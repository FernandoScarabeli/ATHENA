import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateExternalTaskDto {
  @IsIn(['GITHUB', 'OPENPROJECT']) provider!: 'GITHUB' | 'OPENPROJECT';
  @IsString() @MinLength(1) @MaxLength(100) mappingId!: string;
  @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @IsString() @MinLength(1) @MaxLength(100_000) description!: string;
  @IsOptional() @IsObject() providerFields?: Record<string, unknown>;
}

export class LinkExternalTaskDto {
  @IsIn(['GITHUB', 'OPENPROJECT']) provider!: 'GITHUB' | 'OPENPROJECT';
  @IsString() @MinLength(1) @MaxLength(100) mappingId!: string;
  @IsString() @MinLength(1) @MaxLength(100) remoteId!: string;
}

export class AttachGithubProjectDto {
  @IsString() @MinLength(1) @MaxLength(100) projectMappingId!: string;
  @IsOptional() @IsString() @MaxLength(100) fieldId?: string;
  @IsOptional() @IsString() @MaxLength(100) optionId?: string;
}

export class ExternalTaskSearchQueryDto {
  @IsString() @MinLength(2) @MaxLength(100) q!: string;
  @IsString() @MinLength(1) @MaxLength(100) mappingId!: string;
}
