import { InventoryService } from "./inventory.service";

describe("InventoryService", () => {
  it("is defined", () => {
    const service = new InventoryService({} as never, {} as never);
    expect(service).toBeDefined();
  });
});
