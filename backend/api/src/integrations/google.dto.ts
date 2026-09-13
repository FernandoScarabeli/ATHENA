import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class GoogleImportDto {
  @IsArray() @ArrayMinSize(1) files!: string[];
}

export class GoogleFilesQueryDto {
  @IsOptional() @IsString() @MaxLength(500) pageToken?: string;
  @IsOptional() @IsString() @MaxLength(120) query?: string;
}

export class GoogleFolderLinkDto { @IsString() @MaxLength(512) externalId!: string; @IsString() @MaxLength(500) name!: string; @IsUUID() projectId!: string; }
