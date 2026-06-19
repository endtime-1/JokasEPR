import { SoyaProcessingService } from "./soya-processing.service";

describe("SoyaProcessingService", () => {
  it("is defined", () => {
    const service = new SoyaProcessingService({} as never, {} as never);
    expect(service).toBeDefined();
  });
});
