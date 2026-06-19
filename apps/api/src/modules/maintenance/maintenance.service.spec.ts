import { MaintenanceService } from "./maintenance.service";

describe("MaintenanceService", () => {
  it("is defined", () => {
    const service = new MaintenanceService({} as never, {} as never);
    expect(service).toBeDefined();
  });
});

