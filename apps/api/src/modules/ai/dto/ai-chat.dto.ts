import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";

export class AiChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9._:/-]+$/)
  model?: string;
}

export class AiSessionQueryDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
