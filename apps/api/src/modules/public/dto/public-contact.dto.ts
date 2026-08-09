import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class PublicContactDto {
  @IsNotEmpty() @IsString() @MaxLength(160) name!: string;
  @IsNotEmpty() @IsString() @MaxLength(30) phone!: string;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsNotEmpty() @IsString() @MaxLength(2000) message!: string;
}
