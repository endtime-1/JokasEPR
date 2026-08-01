import { Test, TestingModule } from "@nestjs/testing";
import { ProcurementService } from "./procurement.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";

describe("ProcurementService", () => {
  let service: ProcurementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: { write: jest.fn() } },
        { provide: LookupCacheService, useValue: { get: jest.fn().mockReturnValue(null), set: jest.fn(), invalidate: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProcurementService>(ProcurementService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
