import { setCachedLookup, getCachedLookup, countFailed, countPending } from "../database";
import { __getMockDb, __reset as resetSqlite } from "../../../__mocks__/expo-sqlite";
import { __reset as resetSecureStore } from "../../../__mocks__/expo-secure-store";

describe("lookup cache — encrypted at rest, not plaintext JSON (M3)", () => {
  beforeEach(() => {
    resetSqlite();
    resetSecureStore();
  });

  it("does not write the raw JSON to SQLite — the stored value is obscured", async () => {
    const db = __getMockDb();
    const customers = [{ id: "c1", name: "Acme Ltd", phone: "+233555000111" }];

    await setCachedLookup("customers", customers);

    const [, , storedValue] = db.runAsync.mock.calls[0];
    expect(storedValue).not.toContain("Acme Ltd");
    expect(storedValue).not.toEqual(JSON.stringify(customers));
    expect(storedValue).toMatch(/^enc1:/);
  });

  it("round-trips through encryption transparently for the caller", async () => {
    const db = __getMockDb();
    const customers = [{ id: "c1", name: "Acme Ltd" }];
    let stored: { data: string; cached_at: string } | null = null;

    db.runAsync.mockImplementation(async (_sql: string, _key: string, data: string, cachedAt: string) => {
      stored = { data, cached_at: cachedAt };
    });
    db.getFirstAsync.mockImplementation(async () => stored);

    await setCachedLookup("customers", customers);
    const result = await getCachedLookup<typeof customers>("customers");

    expect(result?.data).toEqual(customers);
  });

  it("still reads a legacy plaintext row written before this fix shipped", async () => {
    const db = __getMockDb();
    const legacyPlaintext = JSON.stringify([{ id: "c1", name: "Legacy Co" }]);
    db.getFirstAsync.mockResolvedValue({ data: legacyPlaintext, cached_at: new Date().toISOString() });

    const result = await getCachedLookup<Array<{ id: string; name: string }>>("customers");

    expect(result?.data).toEqual([{ id: "c1", name: "Legacy Co" }]);
  });
});

describe("countFailed — surfaces records that hit the retry ceiling (M5)", () => {
  beforeEach(() => {
    resetSqlite();
    resetSecureStore();
  });

  it("counts only unsynced records with attempts >= 5", async () => {
    const db = __getMockDb();
    db.getFirstAsync.mockResolvedValue({ count: 3 });

    const result = await countFailed();

    expect(result).toBe(3);
    const [sql] = db.getFirstAsync.mock.calls[0];
    expect(sql).toContain("attempts >= 5");
  });

  it("is a distinct query from countPending (attempts < 5), not the same count", async () => {
    const db = __getMockDb();
    db.getFirstAsync.mockResolvedValue({ count: 0 });

    await countPending();
    await countFailed();

    const pendingSql = db.getFirstAsync.mock.calls[0][0];
    const failedSql = db.getFirstAsync.mock.calls[1][0];
    expect(pendingSql).toContain("attempts < 5");
    expect(failedSql).toContain("attempts >= 5");
  });
});
