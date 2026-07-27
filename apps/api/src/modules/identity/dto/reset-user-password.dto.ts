import { IsString, Matches, MinLength } from "class-validator";

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(10)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: "password must include uppercase, lowercase, number, and symbol characters"
  })
  newPassword!: string;
}
