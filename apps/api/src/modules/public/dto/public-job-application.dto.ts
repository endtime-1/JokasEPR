import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

// Public job application (multipart form: these are the text fields, the CV is the "cv" file).
// Empty strings from the form are treated as "not given".
const blank = ({ value }: { value: unknown }) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export class PublicJobApplicationDto {
  @IsNotEmpty() @IsString() @MaxLength(80) firstName!: string;
  @IsNotEmpty() @IsString() @MaxLength(80) lastName!: string;
  @IsNotEmpty() @IsString() @MaxLength(40) phone!: string;
  @Transform(blank) @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @Transform(blank) @IsOptional() @IsIn(["Male", "Female", "Other"]) gender?: string;
  @Transform(blank) @IsOptional() @IsString() @MaxLength(20) dateOfBirth?: string;
  @IsNotEmpty() @IsString() @MaxLength(300) address!: string;
  @Transform(blank) @IsOptional() @IsString() @MaxLength(120) education?: string;
  @Transform(blank) @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : parseInt(value, 10))) @IsInt() @Min(0) @Max(60) yearsExperience?: number;
  @Transform(blank) @IsOptional() @IsString() @MaxLength(160) currentEmployer?: string;
  @Transform(blank) @IsOptional() @IsString() @MaxLength(60) expectedSalary?: string;
  @Transform(blank) @IsOptional() @IsString() @MaxLength(120) availability?: string;
  @Transform(blank) @IsOptional() @IsString() @MaxLength(4000) coverLetter?: string;
}
