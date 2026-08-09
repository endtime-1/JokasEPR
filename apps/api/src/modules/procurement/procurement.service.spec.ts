import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AuthenticatedUser } from "@jokas/shared";
import { ProcurementService } from "./procurement.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("PO-REF-001") }));

const mockPrisma = {
  purchaseRequest: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  purchaseOrder: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  warehouse: { findFirst: jest.fn() },
  goodsReceivedNote: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  product: { findMany: jest.fn() },
  purchaseOrderItem: { update: jest.fn().mockResolvedValue({}) },
  supplierInvoice: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
  procurementPayment: { create: jest.fn() },
  purchaseApproval: { create: jest.fn().mockResolvedValue({}) },
  $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma))
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

  describe("createGRN / postGRN — warehouse access guard (H3)", () => {
    const grnDto = {
      purchaseOrderId: "po-1",
      warehouseId: "wh-1",
      items: [{ productId: "prod-1", productName: "Widget", orderedQty: 5, receivedQty: 5, unitCost: 10, uomCode: "EA" }]
    };

    it("rejects creating a GRN for a warehouse the actor doesn't have access to", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", companyId: "company-1", status: "APPROVED", supplierId: "sup-1" });
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", companyId: "company-1" });

      await expect(
        service.createGRN(makeUser({ warehouseIds: ["wh-OTHER"] }), grnDto as never, {})
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.goodsReceivedNote.create).not.toHaveBeenCalled();
    });

    it("rejects creating a GRN for a warehouse that doesn't belong to the company at all", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", companyId: "company-1", status: "APPROVED", supplierId: "sup-1" });
      mockPrisma.warehouse.findFirst.mockResolvedValue(null);

      await expect(
        service.createGRN(makeUser({ warehouseIds: ["wh-1"] }), grnDto as never, {})
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.goodsReceivedNote.create).not.toHaveBeenCalled();
    });

    it("allows creating a GRN for a warehouse the actor is assigned to", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", companyId: "company-1", status: "APPROVED", supplierId: "sup-1" });
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", companyId: "company-1" });
      mockPrisma.goodsReceivedNote.create.mockResolvedValue({ id: "grn-1" });

      await service.createGRN(makeUser({ warehouseIds: ["wh-1"] }), grnDto as never, {});

      expect(mockPrisma.goodsReceivedNote.create).toHaveBeenCalled();
    });

    it("rejects posting a GRN for a warehouse the actor doesn't have access to", async () => {
      mockPrisma.goodsReceivedNote.findFirst.mockResolvedValue({ id: "grn-1", companyId: "company-1", status: "QUALITY_PASSED", warehouseId: "wh-OTHER", items: [] });

      await expect(
        service.postGRN(makeUser({ warehouseIds: ["wh-1"] }), "grn-1", {})
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.warehouse.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("updatePOReceivedQty — writes per-line receivedQty, not just PO status (L3)", () => {
    it("writes the summed GRN-item receivedQty back onto each PurchaseOrderItem", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", companyId: "company-1", status: "APPROVED", supplierId: "sup-1" });
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", companyId: "company-1" });
      mockPrisma.goodsReceivedNote.create.mockResolvedValue({ id: "grn-1" });
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: "po-1", status: "APPROVED",
        items: [{ id: "poi-1", quantity: 10 }, { id: "poi-2", quantity: 5 }],
        grnRecords: [
          { items: [{ purchaseOrderItemId: "poi-1", receivedQty: 4 }, { purchaseOrderItemId: "poi-2", receivedQty: 5 }] },
          { items: [{ purchaseOrderItemId: "poi-1", receivedQty: 3 }] },
        ],
      });

      await service.createGRN(
        makeUser({ warehouseIds: ["wh-1"] }),
        { purchaseOrderId: "po-1", warehouseId: "wh-1", items: [{ productId: "prod-1", productName: "Widget", orderedQty: 5, receivedQty: 5, unitCost: 10, uomCode: "EA" }] } as never,
        {}
      );

      expect(mockPrisma.purchaseOrderItem.update).toHaveBeenCalledWith({ where: { id: "poi-1" }, data: { receivedQty: 7 } });
      expect(mockPrisma.purchaseOrderItem.update).toHaveBeenCalledWith({ where: { id: "poi-2" }, data: { receivedQty: 5 } });
      // 7 + 5 = 12 >= totalQty 15? no — 12 < 15, so PARTIALLY_RECEIVED
      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith({ where: { id: "po-1" }, data: { status: "PARTIALLY_RECEIVED" } });
    });

    it("writes 0 for a PO line with no matching GRN items at all", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", companyId: "company-1", status: "APPROVED", supplierId: "sup-1" });
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", companyId: "company-1" });
      mockPrisma.goodsReceivedNote.create.mockResolvedValue({ id: "grn-1" });
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        id: "po-1", status: "APPROVED",
        items: [{ id: "poi-1", quantity: 10 }],
        grnRecords: [],
      });

      await service.createGRN(
        makeUser({ warehouseIds: ["wh-1"] }),
        { purchaseOrderId: "po-1", warehouseId: "wh-1", items: [{ productId: "prod-1", productName: "Widget", orderedQty: 5, receivedQty: 5, unitCost: 10, uomCode: "EA" }] } as never,
        {}
      );

      expect(mockPrisma.purchaseOrderItem.update).toHaveBeenCalledWith({ where: { id: "poi-1" }, data: { receivedQty: 0 } });
    });
  });

  describe("postGRN — qualityCheckRequired actually gates the workflow (L3)", () => {
    it("rejects posting a RECEIVED GRN that still requires a quality check", async () => {
      mockPrisma.goodsReceivedNote.findFirst.mockResolvedValue({ id: "grn-1", companyId: "company-1", status: "RECEIVED", qualityCheckRequired: true, warehouseId: "wh-1", items: [] });

      await expect(service.postGRN(makeUser({ warehouseIds: ["wh-1"] }), "grn-1", {})).rejects.toThrow(BadRequestException);
      expect(mockPrisma.warehouse.findFirst).not.toHaveBeenCalled();
    });

    it("allows posting a RECEIVED GRN directly when it was marked as not needing a quality check", async () => {
      mockPrisma.goodsReceivedNote.findFirst.mockResolvedValue({ id: "grn-1", companyId: "company-1", status: "RECEIVED", qualityCheckRequired: false, warehouseId: "wh-1", items: [] });
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", branchId: "branch-1", farmId: null, productionSiteId: null });
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.postGRN(makeUser({ warehouseIds: ["wh-1"] }), "grn-1", {});

      expect(mockPrisma.goodsReceivedNote.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "grn-1" }, data: expect.objectContaining({ status: "POSTED" }) })
      );
    });

    it("still allows posting a QUALITY_PASSED GRN as before, regardless of qualityCheckRequired", async () => {
      mockPrisma.goodsReceivedNote.findFirst.mockResolvedValue({ id: "grn-1", companyId: "company-1", status: "QUALITY_PASSED", qualityCheckRequired: true, warehouseId: "wh-1", items: [] });
      mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1", branchId: "branch-1", farmId: null, productionSiteId: null });
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.postGRN(makeUser({ warehouseIds: ["wh-1"] }), "grn-1", {});

      expect(mockPrisma.goodsReceivedNote.update).toHaveBeenCalled();
    });
  });

  describe("createPayment — transaction-wrapped, race-safe overpayment guard (C2, L4)", () => {
    beforeEach(() => {
      mockPrisma.procurementPayment.create.mockResolvedValue({ id: "pay-1" });
    });

    it("rejects up front when the invoice already has no outstanding balance", async () => {
      mockPrisma.supplierInvoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 0, paidAmount: 100 });

      await expect(
        service.createPayment(makeUser(), { supplierId: "sup-1", invoiceId: "inv-1", amount: 50, paymentDate: "2026-08-01", paymentMethod: "BANK_TRANSFER" } as never, {})
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.procurementPayment.create).not.toHaveBeenCalled();
    });

    it("rejects if the atomic guarded decrement finds insufficient balance (the race case)", async () => {
      // Simulates the exact race the prior bug allowed: the invoice looked
      // like it had enough balance when read before the transaction, but a
      // concurrent payment already consumed it by the time this one's
      // guarded update actually runs.
      mockPrisma.supplierInvoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 20, paidAmount: 80 });
      mockPrisma.supplierInvoice.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.createPayment(makeUser(), { supplierId: "sup-1", invoiceId: "inv-1", amount: 50, paymentDate: "2026-08-01", paymentMethod: "BANK_TRANSFER" } as never, {})
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.supplierInvoice.updateMany).toHaveBeenCalledWith({
        where: { id: "inv-1", balanceDue: { gte: 50 } },
        data: expect.objectContaining({ paidAmount: { increment: 50 }, balanceDue: { decrement: 50 } })
      });
      expect(mockPrisma.supplierInvoice.update).not.toHaveBeenCalled();
    });

    it("marks the invoice PAID via a fresh post-decrement read when the guarded update succeeds", async () => {
      mockPrisma.supplierInvoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 20, paidAmount: 80 });
      mockPrisma.supplierInvoice.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.supplierInvoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 0 });

      await service.createPayment(makeUser(), { supplierId: "sup-1", invoiceId: "inv-1", amount: 20, paymentDate: "2026-08-01", paymentMethod: "BANK_TRANSFER" } as never, {});

      expect(mockPrisma.procurementPayment.create).toHaveBeenCalled();
      expect(mockPrisma.supplierInvoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "PAID" } });
    });

    it("marks the invoice MATCHED when balance remains after the guarded decrement", async () => {
      mockPrisma.supplierInvoice.findFirst.mockResolvedValue({ id: "inv-1", balanceDue: 100, paidAmount: 0 });
      mockPrisma.supplierInvoice.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.supplierInvoice.findUniqueOrThrow.mockResolvedValue({ balanceDue: 40 });

      await service.createPayment(makeUser(), { supplierId: "sup-1", invoiceId: "inv-1", amount: 60, paymentDate: "2026-08-01", paymentMethod: "BANK_TRANSFER" } as never, {});

      expect(mockPrisma.supplierInvoice.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { status: "MATCHED" } });
    });

    it("404s for an invoiceId that doesn't belong to the actor's company", async () => {
      mockPrisma.supplierInvoice.findFirst.mockResolvedValue(null);

      await expect(
        service.createPayment(makeUser(), { supplierId: "sup-1", invoiceId: "inv-other-co", amount: 10, paymentDate: "2026-08-01", paymentMethod: "BANK_TRANSFER" } as never, {})
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.procurementPayment.create).not.toHaveBeenCalled();
    });

    it("skips the balance check entirely for a payment with no linked invoice", async () => {
      await service.createPayment(makeUser(), { supplierId: "sup-1", amount: 999999, paymentDate: "2026-08-01", paymentMethod: "BANK_TRANSFER" } as never, {});

      expect(mockPrisma.supplierInvoice.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.procurementPayment.create).toHaveBeenCalled();
    });
  });

  describe("approvePurchaseOrder / approvePurchaseRequest — self-approval guard (H11)", () => {
    it("blocks approving a purchase order the actor created themselves", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", companyId: "company-1", status: "PENDING_APPROVAL", createdById: "user-1" });
      await expect(
        service.approvePurchaseOrder(makeUser({ id: "user-1" }), "po-1", {} as never, {})
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.purchaseOrder.update).not.toHaveBeenCalled();
    });

    it("allows approving a purchase order created by a different user", async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po-1", companyId: "company-1", status: "PENDING_APPROVAL", createdById: "creator-1" });
      mockPrisma.purchaseOrder.update.mockResolvedValue({ id: "po-1", status: "APPROVED" });
      await expect(
        service.approvePurchaseOrder(makeUser({ id: "approver-1" }), "po-1", {} as never, {})
      ).resolves.toBeDefined();
    });

    it("blocks approving a purchase request the actor created themselves", async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({ id: "pr-1", companyId: "company-1", status: "SUBMITTED", createdById: "user-1" });
      await expect(
        service.approvePurchaseRequest(makeUser({ id: "user-1" }), "pr-1", {} as never, {})
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.purchaseRequest.update).not.toHaveBeenCalled();
    });
  });
});
