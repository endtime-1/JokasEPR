import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

const blank = ({ value }: { value: unknown }) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export class CreateFieldVisitDto {
  // Managers can plan a visit for a rep; reps can only plan their own.
  @IsOptional() @IsUUID() repId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsString() @MaxLength(200) placeName!: string;
  @Transform(blank) @IsOptional() @IsString() @MaxLength(300) address?: string;
  @Transform(blank) @IsOptional() @IsString() @MaxLength(300) purpose?: string;
  @IsDateString() plannedFor!: string;
  // The pin the rep is expected to be at. Without it the visit cannot be verified automatically.
  @IsOptional() @IsNumber() @Min(-90) @Max(90) plannedLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) plannedLon?: number;
}

export class FieldVisitCheckInDto {
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  // Reported by the phone / browser: the radius (metres) the position is good to.
  @IsOptional() @IsNumber() @Min(0) @Max(1000000) accuracyM?: number;
  @IsIn(["MOBILE", "WEB"]) source!: "MOBILE" | "WEB";
  @Transform(blank) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class FieldVisitQueryDto {
  @IsOptional() @IsUUID() repId?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() status?: string;
}
