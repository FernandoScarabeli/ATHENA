import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GoogleImportDto {
  @IsArray() @ArrayMinSize(1) files!: string[];
}

export class GoogleFilesQueryDto {
  @IsOptional() @IsString() @MaxLength(500) pageToken?: string;
  @IsOptional() @IsString() @MaxLength(120) query?: string;
}

export class GoogleFolderLinkDto { @IsString() @MaxLength(512) externalId!: string; @IsString() @MaxLength(500) name!: string; @IsUUID() projectId!: string; }

export class GoogleSyncRunQueryDto { @IsOptional() @IsString() @MaxLength(80) cursor?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number; }

export class IntegrationActivityQueryDto {
  @IsOptional() @IsString() @MaxLength(240) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsIn(['ALL', 'GOOGLE', 'GITHUB', 'OPENPROJECT']) provider?: 'ALL' | 'GOOGLE' | 'GITHUB' | 'OPENPROJECT';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsIn(['ALL', 'COMPLETED', 'FAILED', 'IN_PROGRESS', 'UNKNOWN']) status?: 'ALL' | 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' | 'UNKNOWN';
}
