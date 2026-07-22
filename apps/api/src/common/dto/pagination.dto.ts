import { Transform } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class PaginationDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number = 50;
}

export type PaginatedResult<T> = {
  data: T[];
  meta: {
    total: number;
    page: number;
    take: number;
    totalPages: number;
  };
};
