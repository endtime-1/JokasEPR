import { IsInt, IsOptional, Max, Min } from "class-validator";
import { Transform } from "class-transformer";

// M14: listUsers previously took no query at all and hard-capped at
// take: 500 in the service — a company past 500 users silently lost the
// rest off the end of the list. take has no default here (the service
// defaults an unset take to 500) so a caller that doesn't send it yet keeps
// getting today's behavior — pagination is opt-in, not a breaking change.
export class ListUsersQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(1000)
  take?: number;
}
