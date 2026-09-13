import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class GithubSourceSelectionDto {
  @IsString() @MinLength(1) @MaxLength(100) owner!: string;
  @IsString() @MinLength(1) @MaxLength(100) repository!: string;
  @IsString() @MinLength(1) @MaxLength(500) path!: string;
}

export class GithubImportDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => GithubSourceSelectionDto)
  sources!: GithubSourceSelectionDto[];
}

export class GithubRepositoriesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) page = 1;
}
