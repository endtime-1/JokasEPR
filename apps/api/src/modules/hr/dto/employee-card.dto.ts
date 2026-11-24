import { IsString, MaxLength, MinLength } from "class-validator";

export class ScanEmployeeCardDto {
  // What the QR on an employee card holds (or what a scanner typed): "JK1.<employee id>.<signature>".
  @IsString()
  @MinLength(20)
  @MaxLength(120)
  code!: string;
}
