import { PlatformService } from "./platform.service";

describe("PlatformService", () => {
  it("is defined", () => {
    const service = new PlatformService({} as never, {} as never);
    expect(service).toBeDefined();
  });
});

