import { Test, TestingModule } from "@nestjs/testing";
import { QualityService } from "./quality.service";

describe("QualityService", () => {
  let service: QualityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualityService,
        { provide: "PrismaService", useValue: {} },
        { provide: "AuditService", useValue: {} },
      ],
    }).compile();

    service = module.get<QualityService>(QualityService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
