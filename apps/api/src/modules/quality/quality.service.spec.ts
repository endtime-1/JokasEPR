import { Test, TestingModule } from "@nestjs/testing";
import { QualityService } from "./quality.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";

describe("QualityService", () => {
  let service: QualityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualityService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: { write: jest.fn() } },
        { provide: LookupCacheService, useValue: { get: jest.fn().mockReturnValue(null), set: jest.fn(), invalidate: jest.fn() } },
      ],
    }).compile();

    service = module.get<QualityService>(QualityService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
