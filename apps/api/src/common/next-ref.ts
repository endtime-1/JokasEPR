type RawClient = {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $transaction?: <T>(fn: (tx: RawClient) => Promise<T>) => Promise<T>;
};

/**
 * Atomically allocates the next document reference number for a given prefix.
 *
 * Pass `this.prisma` for calls outside a transaction, or `tx` when already
 * inside an interactive transaction — both cases are safe.
 *
 * Uses MySQL LAST_INSERT_ID() to guarantee no two concurrent requests receive
 * the same number, replacing the racy count+1 pattern.
 */
export async function nextRef(db: RawClient, companyId: string, prefix: string): Promise<string> {
  if (db.$transaction) {
    return db.$transaction((tx) => allocate(tx, companyId, prefix));
  }
  return allocate(db, companyId, prefix);
}

async function allocate(db: RawClient, companyId: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  await db.$executeRaw`INSERT INTO RefSequence (id, companyId, prefix, year, lastSeq)
    VALUES (UUID(), ${companyId}, ${prefix}, ${year}, LAST_INSERT_ID(1))
    ON DUPLICATE KEY UPDATE lastSeq = LAST_INSERT_ID(lastSeq + 1)`;
  const rows = await db.$queryRaw<[{ seq: bigint }]>`SELECT LAST_INSERT_ID() AS seq`;
  const seq = Number(rows[0].seq);
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}
