import { FinanceService } from "./finance.service";

describe("FinanceService", () => {
  it("is defined with injected dependencies", () => {
    const service = new FinanceService({} as never, {} as never);
    expect(service).toBeDefined();
  });
});
