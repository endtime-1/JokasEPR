// (M20) Jokas ERP operates in Ghana; Africa/Accra is UTC+0 year-round with no
// DST, so "midnight in Accra" is always numerically identical to "midnight
// UTC" for the same calendar date. These helpers build day/month boundaries
// from explicit UTC date parts, instead of the ambient `new Date()` +
// `setHours(0, 0, 0, 0)` pattern (which resolves against the Node process's
// *local* timezone — whatever the host happens to be configured with — and
// would silently shift "today"/"this month" boundaries by hours if the
// server's TZ ever differs from Accra, e.g. after a host migration).

export function startOfTodayAccra(): Date {
  return startOfDayAccra(new Date());
}

export function startOfDayAccra(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

export function startOfMonthAccra(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function endOfDayAccra(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}
