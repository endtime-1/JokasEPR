import { PaginationDto, PaginatedResult } from "../dto/pagination.dto";

/** Convert a PaginationDto to Prisma skip/take values. */
export function paginationArgs(dto: PaginationDto): { skip: number; take: number } {
  const take = dto.take ?? 50;
  const page = dto.page ?? 1;
  return { skip: (page - 1) * take, take };
}

/** Wrap a [data, total] tuple into the standard paginated envelope. */
export function paginated<T>(
  data: T[],
  total: number,
  dto: PaginationDto
): PaginatedResult<T> {
  const take = dto.take ?? 50;
  const page = dto.page ?? 1;
  return {
    data,
    meta: {
      total,
      page,
      take,
      totalPages: Math.max(1, Math.ceil(total / take)),
    },
  };
}
