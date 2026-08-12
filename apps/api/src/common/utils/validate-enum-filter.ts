import { BadRequestException } from "@nestjs/common";

/**
 * BACK-7: list/filter endpoints accept an optional `status` (or similar)
 * query param as free text and pass it straight into a Prisma `where`
 * clause. Prisma enum columns reject any value that isn't one of the
 * enum's real values, so a stale dropdown option or a hand-crafted request
 * produced an unhandled Prisma validation error (a raw 500) instead of a
 * clean "invalid value" 400. Validate against the real, Prisma-generated
 * enum values (Object.values(EnumName)) before the value ever reaches a
 * `where` clause — never hand-type the allowed list, since that's exactly
 * the drift that caused the dashboard.service.ts maintenance-status bug
 * this same session.
 */
export function validateEnumFilter(
  value: string | undefined,
  allowed: readonly string[],
  fieldName = "status"
): string | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) {
    throw new BadRequestException(`Invalid ${fieldName} filter: "${value}". Must be one of: ${allowed.join(", ")}.`);
  }
  return value;
}
