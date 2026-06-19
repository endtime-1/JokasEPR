import { Test, TestingModule } from "@nestjs/testing";
import { HRService } from "./hr.service";

describe("HRService", () => {
  let service: HRService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HRService,
        { provide: "PrismaService", useValue: {} },
        { provide: "AuditService", useValue: {} },
      ],
    }).compile();

    service = module.get<HRService>(HRService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
