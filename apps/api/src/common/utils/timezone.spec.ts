import { endOfDayAccra, startOfDayAccra, startOfMonthAccra, startOfTodayAccra } from "./timezone";

// (M20) Africa/Accra is UTC+0 year-round with no DST, so these helpers build
// boundaries from UTC date parts explicitly rather than relying on the Node
// process's local timezone (setHours/setDate resolve against whatever TZ the
// host happens to be configured with).
describe("timezone utils — pin to Africa/Accra (UTC+0), not the host's local TZ (M20)", () => {
  it("startOfDayAccra returns midnight UTC for the given date's calendar day", () => {
    const input = new Date(Date.UTC(2026, 7, 9, 14, 30, 0)); // 2026-08-09 14:30 UTC
    const result = startOfDayAccra(input);
    expect(result.toISOString()).toBe("2026-08-09T00:00:00.000Z");
  });

  it("endOfDayAccra returns 23:59:59.999 UTC for the given date's calendar day", () => {
    const input = new Date(Date.UTC(2026, 7, 9, 3, 0, 0));
    const result = endOfDayAccra(input);
    expect(result.toISOString()).toBe("2026-08-09T23:59:59.999Z");
  });

  it("startOfMonthAccra returns the 1st of the month at midnight UTC", () => {
    const input = new Date(Date.UTC(2026, 7, 25, 9, 0, 0));
    const result = startOfMonthAccra(input);
    expect(result.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("startOfTodayAccra is derived from the current UTC calendar date", () => {
    const result = startOfTodayAccra();
    const now = new Date();
    expect(result.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(result.getUTCMonth()).toBe(now.getUTCMonth());
    expect(result.getUTCDate()).toBe(now.getUTCDate());
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });

  it("does not shift the calendar day even near a UTC day boundary", () => {
    // 23:59 UTC on Aug 9 is still Aug 9 in Accra (UTC+0) — confirms these
    // helpers don't accidentally roll over via local-TZ arithmetic.
    const input = new Date(Date.UTC(2026, 7, 9, 23, 59, 0));
    expect(startOfDayAccra(input).toISOString()).toBe("2026-08-09T00:00:00.000Z");
  });
});
