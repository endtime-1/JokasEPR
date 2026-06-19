import { IdentityService } from "./identity.service";

describe("IdentityService", () => {
  it("is defined", () => {
    const service = new IdentityService({} as never, {} as never);
    expect(service).toBeDefined();
  });
});

