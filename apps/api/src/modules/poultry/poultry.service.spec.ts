import { PoultryService } from "./poultry.service";

describe("PoultryService", () => {
  it("is defined", () => {
    const service = new PoultryService({} as never, {} as never);
    expect(service).toBeDefined();
  });
});
