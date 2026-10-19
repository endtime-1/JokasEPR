import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

// "Become a Retailer" form on akokofeeds.com.
export class RetailerApplicationDto {
  @IsNotEmpty() @IsString() @MaxLength(160) name!: string;
  @IsNotEmpty() @IsString() @MaxLength(200) location!: string;
  @IsNotEmpty() @IsString() @MaxLength(30) phone!: string;
  @IsOptional() @IsEmail() @MaxLength(160) email?: string;
  @IsBoolean() isDistributor!: boolean;
  @IsOptional() @IsString() @MaxLength(200) distributorFeed?: string;
}
