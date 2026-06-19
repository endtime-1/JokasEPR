import { FeedProductionService } from "./feed-production.service";

describe("FeedProductionService", () => {
  it("is defined", () => {
    const service = new FeedProductionService({} as never, {} as never);
    expect(service).toBeDefined();
  });
});
