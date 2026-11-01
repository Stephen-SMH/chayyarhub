// Request bodies, checked by Nest's ValidationPipe before a handler runs.

import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CredentialsDto {
  @IsString() username: string;
  @IsString() password: string;
}

export class NewRepoDto {
  @IsString() name: string;
  @IsOptional() @IsString() @MaxLength(350) description?: string;
  @IsOptional() @IsBoolean() private?: boolean;
  @IsOptional() @IsBoolean() readme?: boolean;
}

export class RepoSettingsDto {
  @IsOptional() @IsString() @MaxLength(350) description?: string;
  @IsOptional() @IsBoolean() private?: boolean;
}

export class NewIssueDto {
  @IsString() title: string;
  @IsOptional() @IsString() @MaxLength(65536) body?: string;
  @IsOptional() @IsString() base?: string;
  @IsOptional() @IsString() head?: string;
}

export class CommentDto {
  @IsString() @MaxLength(65536) body: string;
}

export class StateDto {
  @IsIn(['open', 'closed']) state: 'open' | 'closed';
}

export class PreviewDto {
  @IsString() @MaxLength(65536) text: string;
}

export class ExplainDto {
  @IsOptional() @IsString() sha?: string;
  @IsOptional() @IsInt() pull?: number;
  @IsOptional() @IsIn(['en', 'my']) lang?: 'en' | 'my';
}
