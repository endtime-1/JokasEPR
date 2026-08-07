import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthenticatedUser } from "@jokas/shared";
import { ProcurementService } from "./procurement.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("PO-REF-001") }));

const mockPrisma = {
  purchaseRequest: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  purchaseOrder: { create: jest.fn() }
};

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user-1", companyId: "company-1", email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false,
    ...overrides
  };
}

describe("ProcurementService", () => {
  let service: ProcurementService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { write: jest.fn() } },
        { provide: LookupCacheService, useValue: { get: jest.fn().mockReturnValue(null), set: jest.fn(), invalidate: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProcurementService>(ProcurementService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createPurchaseOrder — cross-tenant purchase-request guard (C6)", () => {
    const dto = {
      supplierId: "sup-1",
      purchaseRequestId: "pr-1",
      items: [{ productId: "prod-1", productName: "Widget", quantity: 2, unitCost: 10, uomCode: "EA" }]
    };

    it("rejects when the referenced purchase request belongs to a different company", async () => {
      // Simulates the vulnerability: a request ID that exists, just not in this company.
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue(null);

      await expect(service.createPurchaseOrder(makeUser(), dto as never, {})).rejects.toThrow(NotFoundException);

      expect(mockPrisma.purchaseRequest.findFirst).toHaveBeenCalledWith({
        where: { id: "pr-1", companyId: "company-1" }
      });
      expect(mockPrisma.purchaseOrder.create).not.toHaveBeenCalled();
    });

    it("rejects when the purchase request was already converted", async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({ id: "pr-1", companyId: "company-1", status: "CONVERTED_TO_PO" });

      await expect(service.createPurchaseOrder(makeUser(), dto as never, {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.purchaseOrder.create).not.toHaveBeenCalled();
    });

    it("proceeds when the purchase request genuinely belongs to the same company and is eligible", async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({ id: "pr-1", companyId: "company-1", status: "APPROVED" });
      mockPrisma.purchaseOrder.create.mockResolvedValue({ id: "po-1", items: [] });

      await service.createPurchaseOrder(makeUser(), dto as never, {});

      expect(mockPrisma.purchaseOrder.create).toHaveBeenCalled();
    });

    it("skips the purchase-request check entirely when no purchaseRequestId is given", async () => {
      mockPrisma.purchaseOrder.create.mockResolvedValue({ id: "po-1", items: [] });

      await service.createPurchaseOrder(makeUser(), { ...dto, purchaseRequestId: undefined } as never, {});

      expect(mockPrisma.purchaseRequest.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.purchaseOrder.create).toHaveBeenCalled();
    });
  });
});
