import { AlertGenerationService } from "./alert-generation.service";

const mockPrisma = {
  flockBatch: { findMany: jest.fn() },
  mortalityRecord: { findMany: jest.fn() },
  eggProductionRecord: { findMany: jest.fn() },
  feedConsumptionRecord: { findMany: jest.fn() }
};

function makeService() {
  return new AlertGenerationService(mockPrisma as never, {} as never);
}

function makeFlock(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Flock ${id}`,
    openingBirdCount: 1000,
    farmId: "farm-1",
    farm: { name: "Farm A", branchId: "branch-1" },
    ...overrides
  };
}

describe("AlertGenerationService — anomaly jobs query once per company, not once per flock (M4)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("mortalityAnomaly issues a single batched mortalityRecord query for multiple flocks", async () => {
    mockPrisma.flockBatch.findMany.mockResolvedValue([makeFlock("f1"), makeFlock("f2"), makeFlock("f3")]);
    mockPrisma.mortalityRecord.findMany.mockResolvedValue([]);

    const service = makeService();
    const out: unknown[] = [];
    await (service as unknown as { mortalityAnomaly: (companyId: string, out: unknown[]) => Promise<void> }).mortalityAnomaly("company-1", out);

    expect(mockPrisma.mortalityRecord.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.mortalityRecord.findMany.mock.calls[0][0].where.flockBatchId).toEqual({ in: ["f1", "f2", "f3"] });
  });

  it("mortalityAnomaly still flags a genuine spike after grouping records in memory", async () => {
    mockPrisma.flockBatch.findMany.mockResolvedValue([makeFlock("f1")]);
    // baseline ~2/day for 11 days, then a 3-day spike to 20/day
    const baselineRows = Array.from({ length: 11 }, (_, i) => ({ flockBatchId: "f1", birdCount: 2, recordDate: new Date(Date.now() - (i + 3) * 86400000) }));
    const spikeRows = [0, 1, 2].map((i) => ({ flockBatchId: "f1", birdCount: 20, recordDate: new Date(Date.now() - i * 86400000) }));
    mockPrisma.mortalityRecord.findMany.mockResolvedValue([...spikeRows, ...baselineRows]);

    const service = makeService();
    const out: Array<{ category: string; entityId: string }> = [];
    await (service as unknown as { mortalityAnomaly: (companyId: string, out: Array<{ category: string; entityId: string }>) => Promise<void> }).mortalityAnomaly("company-1", out);

    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("MORTALITY_ANOMALY");
    expect(out[0].entityId).toBe("f1");
  });

  it("mortalityAnomaly skips flocks with fewer than 7 records without erroring", async () => {
    mockPrisma.flockBatch.findMany.mockResolvedValue([makeFlock("f1")]);
    mockPrisma.mortalityRecord.findMany.mockResolvedValue([
      { flockBatchId: "f1", birdCount: 2 },
      { flockBatchId: "f1", birdCount: 2 }
    ]);

    const service = makeService();
    const out: unknown[] = [];
    await (service as unknown as { mortalityAnomaly: (companyId: string, out: unknown[]) => Promise<void> }).mortalityAnomaly("company-1", out);

    expect(out).toHaveLength(0);
  });

  it("eggProductionDrop issues a single batched eggProductionRecord query for multiple flocks", async () => {
    mockPrisma.flockBatch.findMany.mockResolvedValue([makeFlock("f1"), makeFlock("f2")]);
    mockPrisma.eggProductionRecord.findMany.mockResolvedValue([]);

    const service = makeService();
    const out: unknown[] = [];
    await (service as unknown as { eggProductionDrop: (companyId: string, out: unknown[]) => Promise<void> }).eggProductionDrop("company-1", out);

    expect(mockPrisma.eggProductionRecord.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.eggProductionRecord.findMany.mock.calls[0][0].where.flockBatchId).toEqual({ in: ["f1", "f2"] });
  });

  it("feedConsumptionAnomaly issues a single batched feedConsumptionRecord query for multiple flocks", async () => {
    mockPrisma.flockBatch.findMany.mockResolvedValue([makeFlock("f1"), makeFlock("f2")]);
    mockPrisma.feedConsumptionRecord.findMany.mockResolvedValue([]);

    const service = makeService();
    const out: unknown[] = [];
    await (service as unknown as { feedConsumptionAnomaly: (companyId: string, out: unknown[]) => Promise<void> }).feedConsumptionAnomaly("company-1", out);

    expect(mockPrisma.feedConsumptionRecord.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.feedConsumptionRecord.findMany.mock.calls[0][0].where.flockBatchId).toEqual({ in: ["f1", "f2"] });
  });

  it("skips the query entirely when there are no active flocks", async () => {
    mockPrisma.flockBatch.findMany.mockResolvedValue([]);

    const service = makeService();
    const out: unknown[] = [];
    await (service as unknown as { mortalityAnomaly: (companyId: string, out: unknown[]) => Promise<void> }).mortalityAnomaly("company-1", out);

    expect(mockPrisma.mortalityRecord.findMany).not.toHaveBeenCalled();
  });
});
