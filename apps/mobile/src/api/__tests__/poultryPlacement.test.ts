import { housesForBatch, pensForBatch } from "../endpoints";

// Minimal shape — only the fields the helpers read.
const opts: any = {
  houses: [
    { id: "h1", code: "H1", name: "House 1", farmId: "f1" },
    { id: "h2", code: "H2", name: "House 2", farmId: "f1" },
    { id: "h3", code: "H3", name: "House 3", farmId: "f1" },
  ],
  pens: [
    { id: "p1", code: "P1", name: "Pen 1", penNumber: 1, poultryHouseId: "h1", farmId: "f1", capacity: 100 },
    { id: "p2", code: "P2", name: "Pen 2", penNumber: 2, poultryHouseId: "h1", farmId: "f1", capacity: 100 },
    { id: "p3", code: "P3", name: "Pen 3", penNumber: 3, poultryHouseId: "h2", farmId: "f1", capacity: 100 },
    { id: "p4", code: "P4", name: "Pen 4", penNumber: 4, poultryHouseId: "h3", farmId: "f1", capacity: 100 },
  ],
  batches: [
    { id: "b1", code: "B1", name: "Batch 1", farmId: "f1", birdType: "LAYERS", poultryHouseId: null },
    { id: "b2", code: "B2", name: "Batch 2", farmId: "f1", birdType: "BROILERS", poultryHouseId: "h3" },
  ],
  allocations: [
    { flockBatchId: "b1", poultryHouseId: "h1", penId: "p1" },
    { flockBatchId: "b1", poultryHouseId: "h2", penId: "p3" },
  ],
};

describe("poultry placement helpers", () => {
  it("housesForBatch → only the houses the batch is allocated to", () => {
    expect(housesForBatch(opts, "b1").map((h: any) => h.id).sort()).toEqual(["h1", "h2"]);
  });

  it("housesForBatch → includes the batch's own primary house when it has no allocations", () => {
    expect(housesForBatch(opts, "b2").map((h: any) => h.id)).toEqual(["h3"]);
  });

  it("housesForBatch → every house when no batch selected", () => {
    expect(housesForBatch(opts, "").map((h: any) => h.id)).toEqual(["h1", "h2", "h3"]);
  });

  it("pensForBatch → only the batch's allocated pens", () => {
    expect(pensForBatch(opts, "b1").map((p: any) => p.id).sort()).toEqual(["p1", "p3"]);
  });

  it("pensForBatch → narrowed further to a house", () => {
    expect(pensForBatch(opts, "b1", "h1").map((p: any) => p.id)).toEqual(["p1"]);
  });

  it("pensForBatch → falls back to all the house's pens when the batch has no allocations", () => {
    expect(pensForBatch(opts, "b2", "h1").map((p: any) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("pensForBatch → empty when neither batch nor house is chosen", () => {
    expect(pensForBatch(opts, "")).toEqual([]);
  });
});
