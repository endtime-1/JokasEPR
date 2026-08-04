import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { nextRef } from "../../common/next-ref";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
import {
  ApprovePurchaseOrderDto,
  ApprovePurchaseRequestDto,
  CreateGRNDto,
  CreatePerformanceRecordDto,
  CreatePriceHistoryDto,
  CreateProcurementPaymentDto,
  CreatePurchaseOrderDto,
  CreatePurchaseRequestDto,
  CreateSupplierCategoryDto,
  CreateSupplierDto,
  CreateSupplierInvoiceDto,
  ProcurementQueryDto,
  QualityFailGRNDto,
  QualityPassGRNDto,
  RejectPurchaseOrderDto,
  RejectPurchaseRequestDto,
  UpdateSupplierDto,
} from "./dto/procurement.dto";

type RequestContext = { ipAddress?: string; userAgent?: string };

function num(v: unknown) {
  return Number(v ?? 0);
}

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookupCache: LookupCacheService
  ) {}

  // â”€â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async dashboard(user: AuthenticatedUser) {
    const cid = user.companyId;
    const [
      activeSuppliers,
      pendingPRs,
      pendingPOs,
      pendingGRNs,
      openInvoices,
      recentPOs,
      recentGRNs,
      systemAlerts,
    ] = await Promise.all([
      this.prisma.supplier.count({ where: { companyId: cid, deletedAt: null, status: "ACTIVE" } }),
      this.prisma.purchaseRequest.count({ where: { companyId: cid, deletedAt: null, status: "SUBMITTED" } }),
      this.prisma.purchaseOrder.count({ where: { companyId: cid, deletedAt: null, status: "PENDING_APPROVAL" } }),
      this.prisma.goodsReceivedNote.count({ where: { companyId: cid, deletedAt: null, status: "QUALITY_HOLD" } }),
      this.prisma.supplierInvoice.aggregate({
        where: { companyId: cid, deletedAt: null, status: { in: ["PENDING", "MATCHED", "APPROVED", "OVERDUE"] } },
        _sum: { balanceDue: true },
        _count: true,
      }),
      this.prisma.purchaseOrder.findMany({
        where: { companyId: cid, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { supplier: { select: { name: true } } },
      }),
      this.prisma.goodsReceivedNote.findMany({
        where: { companyId: cid, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { supplier: { select: { name: true } }, warehouse: { select: { name: true } } },
      }),
      this.prisma.dashboardAlert.findMany({
        where: { companyId: cid, businessUnit: "PROCUREMENT", status: "OPEN", deletedAt: null },
        select: { id: true, title: true, message: true, severity: true, occurredAt: true },
        orderBy: { occurredAt: "desc" },
        take: 10,
      }),
    ]);

    return {
      data: {
        activeSuppliers,
        pendingPRs,
        pendingPOs,
        pendingQualityGRNs: pendingGRNs,
        openInvoiceCount: openInvoices._count,
        openInvoiceBalance: num(openInvoices._sum.balanceDue),
        recentPOs,
        recentGRNs,
        systemAlerts,
      },
    };
  }

  // â”€â”€â”€ Options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async options(user: AuthenticatedUser) {
    const cid = user.companyId;
    const scopeKey = user.hasGlobalAccess ? "g" : user.id;
    const cacheKey = `procurement:opts:${cid}:${scopeKey}`;
    const cached = this.lookupCache.get<object>(cacheKey);
    if (cached) return cached;

    const branchWhere = user.hasGlobalAccess
      ? { companyId: cid, deletedAt: null }
      : user.branchIds.length
        ? { companyId: cid, deletedAt: null, id: { in: user.branchIds } }
        : { companyId: cid, deletedAt: null, id: "__" };
    const warehouseWhere = user.hasGlobalAccess
      ? { companyId: cid, deletedAt: null }
      : user.warehouseIds.length
        ? { companyId: cid, deletedAt: null, id: { in: user.warehouseIds } }
        : { companyId: cid, deletedAt: null, id: "__" };

    const [branches, warehouses, suppliers, supplierCategories, bankAccounts] = await Promise.all([
      this.prisma.branch.findMany({ where: branchWhere, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.warehouse.findMany({ where: warehouseWhere, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.supplier.findMany({ where: { companyId: cid, deletedAt: null, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.supplierCategory.findMany({ where: { companyId: cid, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.bankAccount.findMany({ where: { companyId: cid, deletedAt: null, isActive: true }, select: { id: true, accountName: true, bankName: true }, orderBy: { accountName: "asc" } }),
    ]);
    const result = { data: { branches, warehouses, suppliers, supplierCategories, bankAccounts } };
    this.lookupCache.set(cacheKey, result);
    return result;
  }

  // â”€â”€â”€ Supplier Categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listSupplierCategories(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.supplierCategory.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.search ? { OR: [{ name: { contains: query.search } }, { code: { contains: query.search } }] } : {}),
      },
      include: { _count: { select: { suppliers: true } } },
      orderBy: { name: "asc" },
    });
    return { data: rows };
  }

  async createSupplierCategory(user: AuthenticatedUser, dto: CreateSupplierCategoryDto, ctx: RequestContext) {
    const exists = await this.prisma.supplierCategory.findUnique({ where: { companyId_code: { companyId: user.companyId, code: dto.code } } });
    if (exists) throw new BadRequestException(`Category code "${dto.code}" already exists`);

    const row = await this.prisma.supplierCategory.create({
      data: { companyId: user.companyId, createdById: user.id, ...dto },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "SupplierCategory", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // â”€â”€â”€ Suppliers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listSuppliers(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.supplier.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.search ? { OR: [{ name: { contains: query.search } }, { code: { contains: query.search } }, { contactPerson: { contains: query.search } }] } : {}),
      },
      include: { category: { select: { name: true, code: true } }, _count: { select: { purchaseOrders: true } } },
      orderBy: { name: "asc" },
      take: 200,
    });
    return { data: rows };
  }

  async getSupplier(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.supplier.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: {
        category: true,
        purchaseOrders: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, reference: true, status: true, totalAmount: true, orderDate: true } },
        performanceRecords: { where: { deletedAt: null }, orderBy: { period: "desc" }, take: 6 },
        priceHistory: { orderBy: { effectiveDate: "desc" }, take: 20 },
      },
    });
    if (!row) throw new NotFoundException("Supplier not found");
    return { data: row };
  }

  async createSupplier(user: AuthenticatedUser, dto: CreateSupplierDto, ctx: RequestContext) {
    const exists = await this.prisma.supplier.findUnique({ where: { companyId_code: { companyId: user.companyId, code: dto.code } } });
    if (exists) throw new BadRequestException(`Supplier code "${dto.code}" already exists`);

    const row = await this.prisma.supplier.create({
      data: { companyId: user.companyId, createdById: user.id, ...dto },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Supplier", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async updateSupplier(user: AuthenticatedUser, id: string, dto: UpdateSupplierDto, ctx: RequestContext) {
    const row = await this.prisma.supplier.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Supplier not found");

    const updated = await this.prisma.supplier.update({ where: { id }, data: { updatedById: user.id, ...dto } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Supplier", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // â”€â”€â”€ Purchase Requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listPurchaseRequests(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.purchaseRequest.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.search ? { OR: [{ reference: { contains: query.search } }, { title: { contains: query.search } }] } : {}),
      },
      include: {
        requestedBy: { select: { fullName: true } },
        branch: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { data: rows };
  }

  async getPurchaseRequest(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.purchaseRequest.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: {
        items: { orderBy: { sequence: "asc" } },
        requestedBy: { select: { fullName: true, email: true } },
        approvedBy: { select: { fullName: true } },
        branch: { select: { name: true } },
        purchaseOrders: { where: { deletedAt: null }, select: { id: true, reference: true, status: true } },
      },
    });
    if (!row) throw new NotFoundException("Purchase Request not found");
    return { data: row };
  }

  async createPurchaseRequest(user: AuthenticatedUser, dto: CreatePurchaseRequestDto, ctx: RequestContext) {
    const reference = await nextRef(this.prisma, user.companyId, "PR");

    const totalEstimate = dto.items.reduce((s, i) => s + (i.quantity * (i.estimatedUnitCost ?? 0)), 0);

    const row = await this.prisma.purchaseRequest.create({
      data: {
        companyId: user.companyId,
        reference,
        title: dto.title,
        requestedById: user.id,
        branchId: dto.branchId,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
        totalEstimate,
        notes: dto.notes,
        createdById: user.id,
        items: {
          create: dto.items.map((item, idx) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            uomCode: item.uomCode,
            estimatedUnitCost: item.estimatedUnitCost,
            description: item.description,
            sequence: item.sequence ?? idx + 1,
          })),
        },
      },
      include: { items: true },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseRequest", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async submitPurchaseRequest(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.purchaseRequest.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Request not found");
    if (row.status !== "DRAFT") throw new BadRequestException("Only DRAFT requests can be submitted");

    const updated = await this.prisma.purchaseRequest.update({ where: { id }, data: { status: "SUBMITTED", updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseRequest", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async approvePurchaseRequest(user: AuthenticatedUser, id: string, dto: ApprovePurchaseRequestDto, ctx: RequestContext) {
    const row = await this.prisma.purchaseRequest.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Request not found");
    if (row.status !== "SUBMITTED") throw new BadRequestException("Only SUBMITTED requests can be approved");

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), updatedById: user.id },
    });

    await this.prisma.purchaseApproval.create({
      data: { companyId: user.companyId, purchaseRequestId: id, approverId: user.id, status: "APPROVED", approvedAt: new Date(), comments: dto.comments, createdById: user.id },
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseRequest", entityId: id, action: "APPROVE", ...ctx });
    return { data: updated };
  }

  async rejectPurchaseRequest(user: AuthenticatedUser, id: string, dto: RejectPurchaseRequestDto, ctx: RequestContext) {
    const row = await this.prisma.purchaseRequest.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Request not found");
    if (!["SUBMITTED", "APPROVED"].includes(row.status)) throw new BadRequestException("Cannot reject this request in its current status");

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: "REJECTED", rejectedById: user.id, rejectionReason: dto.reason, updatedById: user.id },
    });

    await this.prisma.purchaseApproval.create({
      data: { companyId: user.companyId, purchaseRequestId: id, approverId: user.id, status: "REJECTED", approvedAt: new Date(), comments: dto.reason, createdById: user.id },
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseRequest", entityId: id, action: "REJECT", ...ctx });
    return { data: updated };
  }

  // â”€â”€â”€ Purchase Orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listPurchaseOrders(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.purchaseOrder.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.search ? { OR: [{ reference: { contains: query.search } }] } : {}),
      },
      include: {
        supplier: { select: { name: true, code: true } },
        _count: { select: { items: true, grnRecords: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { data: rows };
  }

  async getPurchaseOrder(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: {
        supplier: true,
        purchaseRequest: { select: { id: true, reference: true, title: true } },
        items: { orderBy: { sequence: "asc" } },
        grnRecords: { where: { deletedAt: null }, select: { id: true, reference: true, status: true, receivedDate: true } },
        invoices: { where: { deletedAt: null }, select: { id: true, reference: true, invoiceNumber: true, status: true, totalAmount: true } },
        approvals: { include: { approver: { select: { fullName: true } } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!row) throw new NotFoundException("Purchase Order not found");
    return { data: row };
  }

  async createPurchaseOrder(user: AuthenticatedUser, dto: CreatePurchaseOrderDto, ctx: RequestContext) {
    const reference = await nextRef(this.prisma, user.companyId, "PO");

    const subtotal = dto.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const totalAmount = subtotal;

    const row = await this.prisma.purchaseOrder.create({
      data: {
        companyId: user.companyId,
        reference,
        supplierId: dto.supplierId,
        purchaseRequestId: dto.purchaseRequestId,
        orderDate: new Date(),
        expectedDelivery: dto.expectedDelivery ? new Date(dto.expectedDelivery) : undefined,
        deliveryAddress: dto.deliveryAddress,
        status: "PENDING_APPROVAL",
        subtotal,
        totalAmount,
        currency: dto.currency ?? "GHS",
        paymentTermsDays: dto.paymentTermsDays,
        notes: dto.notes,
        createdById: user.id,
        items: {
          create: dto.items.map((item, idx) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitCost: item.unitCost,
            lineTotal: item.quantity * item.unitCost,
            uomCode: item.uomCode,
            description: item.description,
            sequence: item.sequence ?? idx + 1,
          })),
        },
      },
      include: { items: true, supplier: { select: { name: true } } },
    });

    if (dto.purchaseRequestId) {
      await this.prisma.purchaseRequest.update({ where: { id: dto.purchaseRequestId }, data: { status: "CONVERTED_TO_PO" } });
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseOrder", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async approvePurchaseOrder(user: AuthenticatedUser, id: string, dto: ApprovePurchaseOrderDto, ctx: RequestContext) {
    const row = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Order not found");
    if (row.status !== "PENDING_APPROVAL") throw new BadRequestException("Only PENDING_APPROVAL orders can be approved");

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), updatedById: user.id },
    });

    await this.prisma.purchaseApproval.create({
      data: { companyId: user.companyId, purchaseOrderId: id, approverId: user.id, status: "APPROVED", approvedAt: new Date(), comments: dto.comments, createdById: user.id },
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseOrder", entityId: id, action: "APPROVE", ...ctx });
    return { data: updated };
  }

  async rejectPurchaseOrder(user: AuthenticatedUser, id: string, dto: RejectPurchaseOrderDto, ctx: RequestContext) {
    const row = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Order not found");
    if (row.status !== "PENDING_APPROVAL") throw new BadRequestException("Only PENDING_APPROVAL orders can be rejected");

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: "CANCELLED", rejectedById: user.id, rejectionReason: dto.reason, updatedById: user.id },
    });

    await this.prisma.purchaseApproval.create({
      data: { companyId: user.companyId, purchaseOrderId: id, approverId: user.id, status: "REJECTED", approvedAt: new Date(), comments: dto.reason, createdById: user.id },
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseOrder", entityId: id, action: "REJECT", ...ctx });
    return { data: updated };
  }

  async sendPurchaseOrder(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Order not found");
    if (row.status !== "APPROVED") throw new BadRequestException("Only APPROVED orders can be sent to supplier");

    const updated = await this.prisma.purchaseOrder.update({ where: { id }, data: { status: "SENT_TO_SUPPLIER", updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseOrder", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // â”€â”€â”€ Goods Received Notes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listGRNs(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.goodsReceivedNote.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.search ? { OR: [{ reference: { contains: query.search } }, { deliveryNoteRef: { contains: query.search } }] } : {}),
      },
      include: {
        supplier: { select: { name: true } },
        purchaseOrder: { select: { reference: true } },
        warehouse: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { data: rows };
  }

  async getGRN(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.goodsReceivedNote.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: {
        supplier: { select: { name: true, code: true } },
        purchaseOrder: { select: { id: true, reference: true, status: true } },
        warehouse: { select: { name: true } },
        branch: { select: { name: true } },
        qualityPassedBy: { select: { fullName: true } },
        items: { include: { purchaseOrderItem: { select: { productName: true, quantity: true } } }, orderBy: { sequence: "asc" } },
      },
    });
    if (!row) throw new NotFoundException("GRN not found");
    return { data: row };
  }

  async createGRN(user: AuthenticatedUser, dto: CreateGRNDto, ctx: RequestContext) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: dto.purchaseOrderId, companyId: user.companyId, deletedAt: null },
    });
    if (!po) throw new NotFoundException("Purchase Order not found");
    if (!["APPROVED", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED"].includes(po.status)) {
      throw new BadRequestException("Purchase Order must be APPROVED or SENT_TO_SUPPLIER to receive goods");
    }

    const reference = await nextRef(this.prisma, user.companyId, "GRN");

    const row = await this.prisma.goodsReceivedNote.create({
      data: {
        companyId: user.companyId,
        reference,
        purchaseOrderId: dto.purchaseOrderId,
        supplierId: po.supplierId,
        warehouseId: dto.warehouseId,
        branchId: dto.branchId,
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : new Date(),
        deliveryNoteRef: dto.deliveryNoteRef,
        status: "RECEIVED",
        qualityCheckRequired: dto.qualityCheckRequired ?? true,
        notes: dto.notes,
        createdById: user.id,
        items: {
          create: dto.items.map((item, idx) => ({
            purchaseOrderItemId: item.purchaseOrderItemId,
            productId: item.productId,
            productName: item.productName,
            orderedQty: item.orderedQty,
            receivedQty: item.receivedQty,
            rejectedQty: item.rejectedQty ?? 0,
            unitCost: item.unitCost,
            uomCode: item.uomCode,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
            qualityStatus: item.qualityStatus,
            notes: item.notes,
            sequence: item.sequence ?? idx + 1,
          })),
        },
      },
      include: { items: true },
    });

    // Move PO items' receivedQty forward and update PO status
    await this.updatePOReceivedQty(dto.purchaseOrderId, po.companyId);

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "GoodsReceivedNote", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async qualityPassGRN(user: AuthenticatedUser, id: string, dto: QualityPassGRNDto, ctx: RequestContext) {
    const row = await this.prisma.goodsReceivedNote.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("GRN not found");
    if (!["RECEIVED", "QUALITY_HOLD"].includes(row.status)) throw new BadRequestException("GRN cannot be quality-passed in its current status");

    const updated = await this.prisma.goodsReceivedNote.update({
      where: { id },
      data: { status: "QUALITY_PASSED", qualityPassedById: user.id, qualityPassedAt: new Date(), qualityNotes: dto.qualityNotes, updatedById: user.id },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "GoodsReceivedNote", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async qualityFailGRN(user: AuthenticatedUser, id: string, dto: QualityFailGRNDto, ctx: RequestContext) {
    const row = await this.prisma.goodsReceivedNote.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("GRN not found");
    if (!["RECEIVED", "QUALITY_HOLD"].includes(row.status)) throw new BadRequestException("GRN cannot be quality-failed in its current status");

    const updated = await this.prisma.goodsReceivedNote.update({
      where: { id },
      data: { status: "QUALITY_FAILED", qualityNotes: dto.qualityNotes, updatedById: user.id },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "GoodsReceivedNote", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async postGRN(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const grn = await this.prisma.goodsReceivedNote.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: { items: true },
    });
    if (!grn) throw new NotFoundException("GRN not found");
    if (grn.status !== "QUALITY_PASSED") throw new BadRequestException("GRN must be QUALITY_PASSED before posting");

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: grn.warehouseId, companyId: user.companyId },
      select: { branchId: true, farmId: true, productionSiteId: true },
    });
    if (!warehouse) throw new NotFoundException("Warehouse not found");

    const productIds = [...new Set(grn.items.filter((i) => i.productId).map((i) => i.productId as string))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, companyId: user.companyId },
      select: { id: true, uomId: true },
    });
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

    await this.prisma.$transaction(async (tx) => {
      for (const item of grn.items) {
        if (!item.productId || num(item.receivedQty) <= 0) continue;

        const acceptedQty = num(item.receivedQty) - num(item.rejectedQty);
        if (acceptedQty <= 0) continue;

        const product = productMap[item.productId];
        if (!product) continue;

        const inventoryItem = await tx.inventoryItem.upsert({
          where: { companyId_warehouseId_productId: { companyId: grn.companyId, warehouseId: grn.warehouseId, productId: item.productId } },
          create: {
            companyId: grn.companyId,
            productId: item.productId,
            warehouseId: grn.warehouseId,
            branchId: warehouse.branchId,
            farmId: warehouse.farmId,
            productionSiteId: warehouse.productionSiteId,
            uomId: product.uomId,
            quantityOnHand: acceptedQty,
            createdById: user.id,
          },
          update: { quantityOnHand: { increment: acceptedQty }, updatedById: user.id },
        });

        const batch = await tx.stockBatch.create({
          data: {
            companyId: grn.companyId,
            productId: item.productId,
            warehouseId: grn.warehouseId,
            branchId: warehouse.branchId,
            farmId: warehouse.farmId,
            productionSiteId: warehouse.productionSiteId,
            inventoryItemId: inventoryItem.id,
            uomId: product.uomId,
            batchNumber: item.batchNumber ?? `GRN-${grn.reference}-${item.id.slice(-6)}`,
            quantityReceived: acceptedQty,
            quantityRemaining: acceptedQty,
            unitCost: item.unitCost,
            expiryDate: item.expiryDate,
            createdById: user.id,
          },
        });

        await tx.stockMovement.create({
          data: {
            companyId: grn.companyId,
            productId: item.productId,
            warehouseId: grn.warehouseId,
            toWarehouseId: grn.warehouseId,
            branchId: warehouse.branchId,
            farmId: warehouse.farmId,
            productionSiteId: warehouse.productionSiteId,
            inventoryItemId: inventoryItem.id,
            stockBatchId: batch.id,
            uomId: product.uomId,
            movementType: "PURCHASE_RECEIPT",
            quantity: acceptedQty,
            unitCost: item.unitCost,
            referenceType: "GoodsReceivedNote",
            referenceId: grn.id,
            createdById: user.id,
            notes: `Auto stock-in from GRN ${grn.reference}`,
          },
        });
      }

      await tx.goodsReceivedNote.update({ where: { id }, data: { status: "POSTED", postedAt: new Date(), updatedById: user.id } });
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "GoodsReceivedNote", entityId: id, action: "APPROVE", ...ctx });
    return { data: { id, status: "POSTED" } };
  }

  // â”€â”€â”€ Supplier Invoices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listInvoices(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.supplierInvoice.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.search ? { OR: [{ reference: { contains: query.search } }, { invoiceNumber: { contains: query.search } }] } : {}),
      },
      include: {
        supplier: { select: { name: true } },
        purchaseOrder: { select: { reference: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { data: rows };
  }

  async createInvoice(user: AuthenticatedUser, dto: CreateSupplierInvoiceDto, ctx: RequestContext) {
    const reference = await nextRef(this.prisma, user.companyId, "SINV");
    const totalAmount = dto.subtotal + (dto.taxAmount ?? 0);

    const row = await this.prisma.supplierInvoice.create({
      data: {
        companyId: user.companyId,
        reference,
        supplierId: dto.supplierId,
        purchaseOrderId: dto.purchaseOrderId,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: new Date(dto.invoiceDate),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        subtotal: dto.subtotal,
        taxAmount: dto.taxAmount ?? 0,
        totalAmount,
        paidAmount: 0,
        balanceDue: totalAmount,
        notes: dto.notes,
        createdById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "SupplierInvoice", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // â”€â”€â”€ Procurement Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listPayments(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.procurementPayment.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.search ? { OR: [{ reference: { contains: query.search } }, { description: { contains: query.search } }] } : {}),
      },
      include: {
        supplier: { select: { name: true } },
        invoice: { select: { invoiceNumber: true, reference: true } },
      },
      orderBy: { paymentDate: "desc" },
      take: 200,
    });
    return { data: rows };
  }

  async createPayment(user: AuthenticatedUser, dto: CreateProcurementPaymentDto, ctx: RequestContext) {
    const reference = await nextRef(this.prisma, user.companyId, "PAY");

    const row = await this.prisma.procurementPayment.create({
      data: {
        companyId: user.companyId,
        reference,
        supplierId: dto.supplierId,
        invoiceId: dto.invoiceId,
        amount: dto.amount,
        paymentDate: new Date(dto.paymentDate),
        paymentMethod: dto.paymentMethod as never,
        bankAccountId: dto.bankAccountId,
        description: dto.description,
        notes: dto.notes,
        createdById: user.id,
      },
    });

    // Update invoice paidAmount and balanceDue if linked
    if (dto.invoiceId) {
      const inv = await this.prisma.supplierInvoice.findUnique({ where: { id: dto.invoiceId } });
      if (inv) {
        const newPaid = num(inv.paidAmount) + dto.amount;
        const newBalance = num(inv.totalAmount) - newPaid;
        await this.prisma.supplierInvoice.update({
          where: { id: dto.invoiceId },
          data: {
            paidAmount: newPaid,
            balanceDue: Math.max(0, newBalance),
            status: newBalance <= 0 ? "PAID" : "MATCHED",
          },
        });
      }
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "ProcurementPayment", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // â”€â”€â”€ Performance Records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listPerformanceRecords(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.supplierPerformanceRecord.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      },
      include: { supplier: { select: { name: true, code: true } } },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
    });
    return { data: rows };
  }

  async createPerformanceRecord(user: AuthenticatedUser, dto: CreatePerformanceRecordDto, ctx: RequestContext) {
    const exists = await this.prisma.supplierPerformanceRecord.findUnique({
      where: { companyId_supplierId_period: { companyId: user.companyId, supplierId: dto.supplierId, period: dto.period } },
    });
    if (exists) throw new BadRequestException(`Performance record for supplier and period "${dto.period}" already exists`);

    const row = await this.prisma.supplierPerformanceRecord.create({
      data: { companyId: user.companyId, createdById: user.id, reviewedById: user.id, ...dto, rating: dto.rating as never },
    });

    // Update supplier rating (simple average of last 4 records)
    const recent = await this.prisma.supplierPerformanceRecord.findMany({
      where: { companyId: user.companyId, supplierId: dto.supplierId, deletedAt: null },
      orderBy: { period: "desc" },
      take: 4,
      select: { qualityScore: true },
    });
    const avgScore = recent.reduce((s, r) => s + r.qualityScore, 0) / recent.length;
    await this.prisma.supplier.update({ where: { id: dto.supplierId }, data: { rating: avgScore / 100 } });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "SupplierPerformanceRecord", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // â”€â”€â”€ Price History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listPriceHistory(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.supplierPriceHistory.findMany({
      where: {
        companyId: user.companyId,
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.search ? { productName: { contains: query.search } } : {}),
      },
      include: { supplier: { select: { name: true, code: true } } },
      orderBy: [{ supplierId: "asc" }, { effectiveDate: "desc" }],
    });
    return { data: rows };
  }

  async createPriceHistory(user: AuthenticatedUser, dto: CreatePriceHistoryDto, ctx: RequestContext) {
    const row = await this.prisma.supplierPriceHistory.create({
      data: { companyId: user.companyId, createdById: user.id, ...dto, effectiveDate: new Date(dto.effectiveDate) },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "SupplierPriceHistory", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async updatePOReceivedQty(purchaseOrderId: string, companyId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true, grnRecords: { where: { deletedAt: null, status: { in: ["RECEIVED", "QUALITY_PASSED", "POSTED"] } }, include: { items: true } } },
    });
    if (!po) return;

    const totalQty = po.items.reduce((s, i) => s + num(i.quantity), 0);
    const receivedQty = po.grnRecords.flatMap((g) => g.items).reduce((s, i) => s + num(i.receivedQty), 0);

    let newStatus = po.status;
    if (receivedQty >= totalQty) newStatus = "FULLY_RECEIVED";
    else if (receivedQty > 0) newStatus = "PARTIALLY_RECEIVED";

    await this.prisma.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: newStatus as never } });
  }
}


