import { IsEmail, IsString, Matches, MinLength } from "class-validator";

export class SetupDto {
  @IsString()
  @MinLength(2)
  companyName!: string;

  @IsString()
  @MinLength(2)
  adminName!: string;

  @IsEmail()
  email!: string;

  // M8: this creates the first company and its Super Admin — every other
  // password DTO in the app (change-password, create-user, reset-user-password)
  // requires upper/lower/digit/symbol via this same regex; setup had only
  // @MinLength(8), making it the weakest password policy in the app for the
  // single most privileged account.
  @IsString()
  @MinLength(10)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: "Password must include uppercase, lowercase, number, and symbol characters"
  })
  password!: string;
}
