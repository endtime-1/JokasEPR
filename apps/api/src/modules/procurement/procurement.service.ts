import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import {
  Prisma,
  SupplierStatus,
  PurchaseRequestStatus,
  PurchaseOrderStatus,
  GRNStatus,
  SupplierInvoiceStatus,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { nextRef } from "../../common/next-ref";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
import { validateEnumFilter } from "../../common/utils/validate-enum-filter";
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
  UpdatePurchaseOrderDto,
  UpdateSupplierDto,
} from "./dto/procurement.dto";

type RequestContext = { ipAddress?: string; userAgent?: string };

function num(v: unknown) {
  return Number(v ?? 0);
}

@Injectable()
export class ProcurementService {
  private readonly logger = new Logger(ProcurementService.name);

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
      take: 200,
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
        ...(query.status ? { status: validateEnumFilter(query.status, Object.values(SupplierStatus)) as never } : {}),
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

  // A supplier with unresolved money or activity on the books (a live
  // purchase order, an unpaid invoice) is blocked from deletion — soft-
  // deleting it would silently orphan that history instead of surfacing it,
  // matching the dependent-record guard sales.service.ts's deleteCustomer
  // already enforces.
  async deleteSupplier(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.supplier.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Supplier not found");

    const [activeOrders, unpaidInvoices] = await Promise.all([
      this.prisma.purchaseOrder.count({ where: { companyId: user.companyId, supplierId: id, status: { not: "CANCELLED" }, deletedAt: null } }),
      this.prisma.supplierInvoice.count({ where: { companyId: user.companyId, supplierId: id, status: { not: "PAID" }, deletedAt: null } }),
    ]);
    if (activeOrders > 0) {
      throw new BadRequestException(`Cannot delete supplier "${row.name}" — it has ${activeOrders} active purchase order(s). Cancel or complete them first.`);
    }
    if (unpaidInvoices > 0) {
      throw new BadRequestException(`Cannot delete supplier "${row.name}" — it has ${unpaidInvoices} unpaid invoice(s). Settle them first.`);
    }

    // @@unique([companyId, code]) isn't deletedAt-aware — without rewriting
    // the code here, deleting a supplier and recreating one with the same
    // code fails the create with a unique-constraint error.
    const deleted = await this.prisma.supplier.update({ where: { id }, data: { code: `${row.code}__deleted_${id}`, deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Supplier", entityId: id, action: "DELETE", ...ctx });
    return { data: deleted };
  }

  // â”€â”€â”€ Purchase Requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listPurchaseRequests(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.purchaseRequest.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: validateEnumFilter(query.status, Object.values(PurchaseRequestStatus)) as never } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        AND: [
          ...(query.search ? [{ OR: [{ reference: { contains: query.search } }, { title: { contains: query.search } }] }] : []),
          ...(this.branchRestricted(user) ? [{ OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] }] : [])
        ]
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
      where: {
        id,
        companyId: user.companyId,
        deletedAt: null,
        ...(this.branchRestricted(user) ? { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] } : {})
      },
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

  // H-BACK-3 (2026-08-11): approve/reject used to be a plain findFirst-then-update
  // plus a separate, un-transacted purchaseApproval.create — two concurrent
  // approve/reject calls on the same request could both pass the initial status
  // check before either write landed (one approves, one rejects, both "succeed"),
  // and a crash between the status update and the approval-record insert left an
  // approved/rejected request with no corresponding audit-trail row. Matches the
  // status-guarded updateMany pattern already proven for leave-request review
  // (hr.service.ts's reviewLeaveRequest) combined with a transaction so the
  // status flip and its approval record can't land independently of each other.
  async approvePurchaseRequest(user: AuthenticatedUser, id: string, dto: ApprovePurchaseRequestDto, ctx: RequestContext) {
    const row = await this.prisma.purchaseRequest.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Request not found");
    if (row.status !== "SUBMITTED") throw new BadRequestException("Only SUBMITTED requests can be approved");
    if (row.createdById === user.id && (await this.requiresSeparateApprover(user.companyId))) {
      throw new ForbiddenException(
        "You cannot approve a purchase request you created yourself. If one person runs procurement here, an admin can turn off \"require a separate procurement approver\" under Settings → User Access."
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const advanced = await tx.purchaseRequest.updateMany({
        where: { id, status: "SUBMITTED" },
        data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), updatedById: user.id },
      });
      if (advanced.count === 0) throw new BadRequestException("Only SUBMITTED requests can be approved");

      await tx.purchaseApproval.create({
        data: { companyId: user.companyId, purchaseRequestId: id, approverId: user.id, status: "APPROVED", approvedAt: new Date(), comments: dto.comments, createdById: user.id },
      });
      return tx.purchaseRequest.findUniqueOrThrow({ where: { id } });
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseRequest", entityId: id, action: "APPROVE", ...ctx });
    return { data: updated };
  }

  async rejectPurchaseRequest(user: AuthenticatedUser, id: string, dto: RejectPurchaseRequestDto, ctx: RequestContext) {
    const row = await this.prisma.purchaseRequest.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Request not found");
    if (!["SUBMITTED", "APPROVED"].includes(row.status)) throw new BadRequestException("Cannot reject this request in its current status");

    const updated = await this.prisma.$transaction(async (tx) => {
      const advanced = await tx.purchaseRequest.updateMany({
        where: { id, status: { in: ["SUBMITTED", "APPROVED"] } },
        data: { status: "REJECTED", rejectedById: user.id, rejectionReason: dto.reason, updatedById: user.id },
      });
      if (advanced.count === 0) throw new BadRequestException("Cannot reject this request in its current status");

      await tx.purchaseApproval.create({
        data: { companyId: user.companyId, purchaseRequestId: id, approverId: user.id, status: "REJECTED", approvedAt: new Date(), comments: dto.reason, createdById: user.id },
      });
      return tx.purchaseRequest.findUniqueOrThrow({ where: { id } });
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
        ...(query.status ? { status: validateEnumFilter(query.status, Object.values(PurchaseOrderStatus)) as never } : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        AND: [
          ...(query.search ? [{ OR: [{ reference: { contains: query.search } }] }] : []),
          ...(this.branchRestricted(user)
            ? [{ OR: [{ purchaseRequestId: null }, { purchaseRequest: { branchId: null } }, { purchaseRequest: { branchId: { in: user.branchIds } } }] }]
            : [])
        ]
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
      where: {
        id,
        companyId: user.companyId,
        deletedAt: null,
        ...(this.branchRestricted(user)
          ? { OR: [{ purchaseRequestId: null }, { purchaseRequest: { branchId: null } }, { purchaseRequest: { branchId: { in: user.branchIds } } }] }
          : {})
      },
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
    // H-HIGH (2026-08-12): this never looked up the supplier at all — the
    // "only active suppliers" dropdown on the create screen was purely
    // cosmetic, since the API itself accepted any UUID. A blacklisted or
    // deactivated supplier (or, worse, one belonging to a different
    // company) could still have real purchase orders written against them
    // by anyone who had or guessed the ID.
    const supplier = await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, companyId: user.companyId, deletedAt: null } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    if (supplier.status !== "ACTIVE") {
      throw new BadRequestException(`Cannot raise a purchase order against "${supplier.name}" — its status is ${supplier.status.replace(/_/g, " ").toLowerCase()}, not active.`);
    }

    // Every other lookup in this file scopes by companyId — this write
    // previously didn't, letting any PROCUREMENT_MANAGE user flip another
    // company's (or another branch's) purchase request status by ID alone.
    if (dto.purchaseRequestId) {
      const purchaseRequest = await this.prisma.purchaseRequest.findFirst({
        where: { id: dto.purchaseRequestId, companyId: user.companyId }
      });
      if (!purchaseRequest) throw new NotFoundException("Purchase Request not found");
      if (purchaseRequest.status === "CONVERTED_TO_PO") {
        throw new BadRequestException("This purchase request has already been converted to a purchase order.");
      }
    }

    const reference = await nextRef(this.prisma, user.companyId, "PO");

    const subtotal = dto.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const totalAmount = subtotal;

    // H8: the PO create and the purchase request's CONVERTED_TO_PO status
    // flip used to be two separate, un-transacted writes — a crash between
    // them left a PO that looked freshly created while its source request
    // still showed as convertible, inviting a duplicate PO on retry.
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
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
        await tx.purchaseRequest.update({ where: { id: dto.purchaseRequestId }, data: { status: "CONVERTED_TO_PO" } });
      }
      return created;
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseOrder", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // Only PENDING_APPROVAL orders can be edited — createPurchaseOrder always
  // creates directly at PENDING_APPROVAL (never DRAFT), and nothing else can
  // reference a PO's lines until it's SENT_TO_SUPPLIER (GRNs/invoices), so
  // this is always the one safe-to-fully-edit state. PurchaseOrderItem has
  // no deletedAt of its own — a full items replace (delete then recreate) is
  // correct here since nothing downstream can be pointing at the old rows yet.
  async updatePurchaseOrder(user: AuthenticatedUser, id: string, dto: UpdatePurchaseOrderDto, ctx: RequestContext) {
    const row = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Order not found");
    if (row.status !== "PENDING_APPROVAL") throw new BadRequestException("Only pending-approval purchase orders can be edited.");

    const scalarData = {
      expectedDelivery: dto.expectedDelivery ? new Date(dto.expectedDelivery) : undefined,
      deliveryAddress: dto.deliveryAddress,
      paymentTermsDays: dto.paymentTermsDays,
      notes: dto.notes,
      updatedById: user.id,
    };

    let updated;
    if (dto.items) {
      const subtotal = dto.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
      updated = await this.prisma.$transaction(async (tx) => {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        return tx.purchaseOrder.update({
          where: { id },
          data: {
            ...scalarData,
            subtotal,
            totalAmount: subtotal,
            items: {
              create: dto.items!.map((item, idx) => ({
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
          include: { items: true },
        });
      });
    } else {
      updated = await this.prisma.purchaseOrder.update({ where: { id }, data: scalarData });
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseOrder", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // H-BACK-3: same status-guarded-updateMany-inside-a-transaction fix as
  // approvePurchaseRequest/rejectPurchaseRequest above, for the same reason.
  async approvePurchaseOrder(user: AuthenticatedUser, id: string, dto: ApprovePurchaseOrderDto, ctx: RequestContext) {
    const row = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Order not found");
    if (row.status !== "PENDING_APPROVAL") throw new BadRequestException("Only PENDING_APPROVAL orders can be approved");
    if (row.createdById === user.id && (await this.requiresSeparateApprover(user.companyId))) {
      throw new ForbiddenException(
        "You cannot approve a purchase order you created yourself. If one person runs procurement here, an admin can turn off \"require a separate procurement approver\" under Settings → User Access."
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const advanced = await tx.purchaseOrder.updateMany({
        where: { id, status: "PENDING_APPROVAL" },
        data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), updatedById: user.id },
      });
      if (advanced.count === 0) throw new BadRequestException("Only PENDING_APPROVAL orders can be approved");

      await tx.purchaseApproval.create({
        data: { companyId: user.companyId, purchaseOrderId: id, approverId: user.id, status: "APPROVED", approvedAt: new Date(), comments: dto.comments, createdById: user.id },
      });
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
    });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseOrder", entityId: id, action: "APPROVE", ...ctx });
    return { data: updated };
  }

  async rejectPurchaseOrder(user: AuthenticatedUser, id: string, dto: RejectPurchaseOrderDto, ctx: RequestContext) {
    const row = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Order not found");
    if (row.status !== "PENDING_APPROVAL") throw new BadRequestException("Only PENDING_APPROVAL orders can be rejected");

    const updated = await this.prisma.$transaction(async (tx) => {
      const advanced = await tx.purchaseOrder.updateMany({
        where: { id, status: "PENDING_APPROVAL" },
        data: { status: "CANCELLED", rejectedById: user.id, rejectionReason: dto.reason, updatedById: user.id },
      });
      if (advanced.count === 0) throw new BadRequestException("Only PENDING_APPROVAL orders can be rejected");

      await tx.purchaseApproval.create({
        data: { companyId: user.companyId, purchaseOrderId: id, approverId: user.id, status: "REJECTED", approvedAt: new Date(), comments: dto.reason, createdById: user.id },
      });
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
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

  // Only PENDING_APPROVAL and CANCELLED orders can be deleted — a
  // cancelled/rejected PO is exactly the "mistake I want to remove" case,
  // but once APPROVED/SENT_TO_SUPPLIER/(PARTIALLY|FULLY)_RECEIVED it has real
  // downstream operational history (approvals at minimum, likely GRNs/
  // invoices) that a delete would silently orphan. The GRN/invoice count is
  // a defensive double-check in case that status assumption is ever wrong.
  async deletePurchaseOrder(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Purchase Order not found");
    if (!["PENDING_APPROVAL", "CANCELLED"].includes(row.status)) {
      throw new BadRequestException(`Cannot delete purchase order "${row.reference}" — it is ${row.status.replace(/_/g, " ").toLowerCase()}. Only pending-approval or cancelled orders can be deleted.`);
    }

    const [grns, invoices] = await Promise.all([
      this.prisma.goodsReceivedNote.count({ where: { companyId: user.companyId, purchaseOrderId: id, deletedAt: null } }),
      this.prisma.supplierInvoice.count({ where: { companyId: user.companyId, purchaseOrderId: id, deletedAt: null } }),
    ]);
    if (grns > 0 || invoices > 0) {
      throw new BadRequestException(`Cannot delete purchase order "${row.reference}" — it has goods-received or invoice records against it.`);
    }

    const deleted = await this.prisma.purchaseOrder.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PurchaseOrder", entityId: id, action: "DELETE", ...ctx });
    return { data: deleted };
  }

  // â”€â”€â”€ Goods Received Notes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listGRNs(user: AuthenticatedUser, query: ProcurementQueryDto) {
    const rows = await this.prisma.goodsReceivedNote.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: validateEnumFilter(query.status, Object.values(GRNStatus)) as never } : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        AND: [
          ...(query.search ? [{ OR: [{ reference: { contains: query.search } }, { deliveryNoteRef: { contains: query.search } }] }] : []),
          ...(this.branchRestricted(user) ? [{ OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] }] : [])
        ]
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
      where: {
        id,
        companyId: user.companyId,
        deletedAt: null,
        ...(this.branchRestricted(user) ? { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] } : {})
      },
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
      include: { items: true, grnRecords: { where: { deletedAt: null }, include: { items: true } } },
    });
    if (!po) throw new NotFoundException("Purchase Order not found");
    if (!["APPROVED", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED"].includes(po.status)) {
      throw new BadRequestException("Purchase Order must be APPROVED or SENT_TO_SUPPLIER to receive goods");
    }
    // Previously dto.warehouseId was trusted with no lookup at all — a
    // foreign or nonexistent warehouse would only surface as an error much
    // later, at postGRN time.
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, companyId: user.companyId, deletedAt: null } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    this.assertWarehouseAccess(user, dto.warehouseId);

    // H-HIGH (2026-08-12): neither of these was checked at all — a
    // double-click, a network retry, or a clerk re-entering the same paper
    // delivery note twice silently doubled real, trusted stock at post time.
    //
    // 1. Duplicate-delivery guard: same PO + same delivery note reference
    // already recorded (and not soft-deleted) is almost certainly the same
    // physical delivery being logged twice. deliveryNoteRef is optional, so
    // this only catches it when one was actually given — a real gap that
    // remains for GRNs with no reference, but it's the common case.
    if (dto.deliveryNoteRef) {
      const dupe = (po.grnRecords ?? []).find((g) => g.deliveryNoteRef === dto.deliveryNoteRef);
      if (dupe) throw new BadRequestException(`A GRN for delivery note "${dto.deliveryNoteRef}" against this purchase order already exists (${dupe.reference}). If this is a genuinely new delivery, use a different reference.`);
    }

    // 2. Over-receipt guard: a line item tied to a specific PO line can't
    // receive more (across this GRN plus everything already received
    // against that line) than was actually ordered. Lines with no
    // purchaseOrderItemId (a manual/off-PO entry) can't be checked this way
    // and are trusted as before.
    const alreadyReceivedByLine = new Map<string, number>();
    for (const g of po.grnRecords ?? []) {
      for (const item of g.items) {
        if (!item.purchaseOrderItemId) continue;
        alreadyReceivedByLine.set(item.purchaseOrderItemId, (alreadyReceivedByLine.get(item.purchaseOrderItemId) ?? 0) + num(item.receivedQty));
      }
    }
    const poItemById = new Map((po.items ?? []).map((i) => [i.id, i]));
    for (const item of dto.items) {
      if (!item.purchaseOrderItemId) continue;
      const line = poItemById.get(item.purchaseOrderItemId);
      if (!line) throw new BadRequestException(`Purchase order line ${item.purchaseOrderItemId} was not found on this purchase order.`);
      const alreadyReceived = alreadyReceivedByLine.get(item.purchaseOrderItemId) ?? 0;
      const ordered = num(line.quantity);
      if (alreadyReceived + item.receivedQty > ordered) {
        throw new BadRequestException(`Receiving ${item.receivedQty} of "${line.productName}" would bring total received to ${(alreadyReceived + item.receivedQty).toFixed(2)}, more than the ${ordered} ordered on this line (${alreadyReceived.toFixed(2)} already received).`);
      }
    }

    const reference = await nextRef(this.prisma, user.companyId, "GRN");

    // H8: the GRN create and the PO's receivedQty/status advancement used
    // to be two separate, un-transacted writes — a crash between them left
    // a GRN that looked freshly received while its PO still showed the old
    // status, inviting a duplicate GRN on retry.
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.goodsReceivedNote.create({
        data: {
          companyId: user.companyId,
          reference,
          purchaseOrderId: dto.purchaseOrderId,
          supplierId: po.supplierId,
          warehouseId: dto.warehouseId,
          branchId: dto.branchId,
          receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : new Date(),
          deliveryNoteRef: dto.deliveryNoteRef,
          // L-BUG (2026-08-13): GRNStatus.QUALITY_HOLD exists specifically
          // for "physically received, awaiting a quality decision" — but
          // every GRN was hardcoded to RECEIVED regardless of
          // qualityCheckRequired, so nothing ever actually reached
          // QUALITY_HOLD. The dashboard's own "pending quality hold" tile
          // always read zero, giving false reassurance nothing was stuck in
          // review. qualityPassGRN/qualityFailGRN already accept RECEIVED
          // or QUALITY_HOLD as valid starting statuses, and postGRN's
          // canPostDirectly already only allows RECEIVED (not QUALITY_HOLD)
          // through without an explicit pass — so this needed no other
          // changes to slot in correctly.
          status: (dto.qualityCheckRequired ?? true) ? "QUALITY_HOLD" : "RECEIVED",
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

      // Move PO items' receivedQty forward and update PO status, in the same transaction
      await this.updatePOReceivedQty(dto.purchaseOrderId, po.companyId, tx);
      return created;
    });

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
    // L3: qualityCheckRequired was stored on the GRN but had no effect on
    // the workflow — every GRN was forced through an explicit
    // qualityPassGRN step regardless of its value. A GRN that was
    // explicitly marked as not needing a quality check can now post
    // directly from RECEIVED; one that does need it still requires the
    // explicit pass.
    const canPostDirectly = grn.status === "RECEIVED" && !grn.qualityCheckRequired;
    if (grn.status !== "QUALITY_PASSED" && !canPostDirectly) {
      throw new BadRequestException("GRN must be QUALITY_PASSED before posting");
    }
    this.assertWarehouseAccess(user, grn.warehouseId);

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: grn.warehouseId, companyId: user.companyId, deletedAt: null },
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
      // C3 (DB stability audit, 2026-08-16): status was only checked by the
      // plain read above, then every line item was posted unconditionally —
      // two concurrent postGRN calls (two clerks, or one double-click) both
      // passed that check and both ran the full receiving loop, doubling
      // on-hand quantity and creating duplicate StockBatch rows for goods
      // that were only physically received once. Claim the row first,
      // matching the exact status already validated above (either of the
      // two valid starting states) — same guarded-updateMany fix as Sales
      // Return approval and Inventory Adjustment approval.
      const claimed = await tx.goodsReceivedNote.updateMany({
        where: { id, status: grn.status },
        data: { status: "POSTED", postedAt: new Date(), updatedById: user.id }
      });
      if (claimed.count === 0) {
        throw new BadRequestException("This GRN has already been posted.");
      }

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
        ...(query.status ? { status: validateEnumFilter(query.status, Object.values(SupplierInvoiceStatus)) as never } : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        AND: [
          ...(query.search ? [{ OR: [{ reference: { contains: query.search } }, { invoiceNumber: { contains: query.search } }] }] : []),
          ...(this.branchRestricted(user)
            ? [
                {
                  OR: [
                    { purchaseOrderId: null },
                    { purchaseOrder: { purchaseRequestId: null } },
                    { purchaseOrder: { purchaseRequest: { branchId: null } } },
                    { purchaseOrder: { purchaseRequest: { branchId: { in: user.branchIds } } } }
                  ]
                }
              ]
            : [])
        ]
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
        AND: [
          ...(query.search ? [{ OR: [{ reference: { contains: query.search } }, { description: { contains: query.search } }] }] : []),
          ...(this.branchRestricted(user)
            ? [
                {
                  OR: [
                    { invoiceId: null },
                    { invoice: { purchaseOrderId: null } },
                    { invoice: { purchaseOrder: { purchaseRequestId: null } } },
                    { invoice: { purchaseOrder: { purchaseRequest: { branchId: null } } } },
                    { invoice: { purchaseOrder: { purchaseRequest: { branchId: { in: user.branchIds } } } } }
                  ]
                }
              ]
            : [])
        ]
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
    // L4: a payment larger than the outstanding balance was previously
    // clamped to a 0 balanceDue instead of rejected. This pre-transaction
    // lookup is now just an early 404/tenant check — the real overpayment
    // guard is the atomic updateMany inside the transaction below.
    // H9: a client retry after a timeout (it never learned whether the
    // first attempt landed) used to pass the overpayment guard a second
    // time independently and record a second real payment. A given
    // idempotencyKey has already been recorded once — replay the original
    // result instead of creating a duplicate.
    if (dto.idempotencyKey) {
      const existing = await this.prisma.procurementPayment.findFirst({ where: { companyId: user.companyId, idempotencyKey: dto.idempotencyKey, deletedAt: null } });
      if (existing) return { data: existing };
    }

    const invoice = dto.invoiceId
      ? await this.prisma.supplierInvoice.findFirst({ where: { id: dto.invoiceId, companyId: user.companyId, deletedAt: null } })
      : null;
    if (dto.invoiceId && !invoice) throw new NotFoundException("Supplier invoice was not found.");
    if (invoice && Number(invoice.balanceDue) <= 0) throw new BadRequestException("Invoice has no outstanding balance.");

    // C2: previously created the payment, then updated the invoice balance
    // as a *separate*, un-transacted write computed from the stale
    // pre-transaction read above. Two concurrent payments against the same
    // invoice could both pass the check, both create a payment, and race on
    // the invoice update — whichever committed last silently discarded the
    // other's effect on paidAmount/balanceDue, while both payments stayed
    // recorded (a real overpayment with no trace of how it happened). Now
    // transaction-wrapped with a guarded atomic decrement, matching the
    // pattern already used by sales.service.ts's createPayment.
    let data;
    try {
      data = await this.prisma.$transaction(async (tx) => {
        const row = await tx.procurementPayment.create({
          data: {
            companyId: user.companyId,
            reference: await nextRef(tx, user.companyId, "PAY"),
            supplierId: dto.supplierId,
            invoiceId: dto.invoiceId,
            amount: dto.amount,
            paymentDate: new Date(dto.paymentDate),
            paymentMethod: dto.paymentMethod as never,
            bankAccountId: dto.bankAccountId,
            description: dto.description,
            notes: dto.notes,
            idempotencyKey: dto.idempotencyKey,
            createdById: user.id,
          },
        });

        if (invoice) {
          const decremented = await tx.supplierInvoice.updateMany({
            where: { id: invoice.id, balanceDue: { gte: dto.amount } },
            data: { paidAmount: { increment: dto.amount }, balanceDue: { decrement: dto.amount }, updatedById: user.id }
          });
          if (decremented.count === 0) {
            throw new BadRequestException(`Payment of ${dto.amount} exceeds the outstanding balance on this invoice.`);
          }
          const refreshed = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: invoice.id }, select: { balanceDue: true } });
          await tx.supplierInvoice.update({
            where: { id: invoice.id },
            data: { status: Number(refreshed.balanceDue) <= 0 ? "PAID" : "MATCHED" }
          });
        }

        return row;
      });
    } catch (err: unknown) {
      // H9: the pre-check above has a race window — two requests carrying
      // the same idempotencyKey can both pass it and both start a
      // transaction. The unique (companyId, idempotencyKey) index makes the
      // DB itself the final arbiter: the loser's insert fails with P2002,
      // and instead of surfacing that as an error, it replays the winner's
      // result — a genuine retry gets the same success response either way.
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.prisma.procurementPayment.findFirst({ where: { companyId: user.companyId, idempotencyKey: dto.idempotencyKey, deletedAt: null } });
        if (existing) return { data: existing };
      }
      throw err;
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "ProcurementPayment", entityId: data.id, action: "CREATE", ...ctx });
    // H21: P&L/Cash Flow reports are built entirely from finance's own
    // Revenue/Expense (and CustomerPayment/SupplierPayment) tables, which
    // only finance's own manual-entry endpoints ever wrote to — real
    // procurement spend lived in ProcurementPayment/SupplierInvoice and was
    // never mirrored in. Contrast with payroll, which does auto-create an
    // Expense row when paid (createPayrollExpense in hr.service.ts) —
    // that's the exact pattern this mirrors: awaited + logged, non-fatal to
    // the payment itself, run after the payment transaction has committed.
    try {
      await this.createProcurementExpense(user, dto.supplierId, data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.warn(`Failed to create Finance expense entry for procurement payment ${data.id} (company ${user.companyId}): ${message}`);
    }
    return { data };
  }

  private async createProcurementExpense(user: AuthenticatedUser, supplierId: string, payment: { id: string; amount: Prisma.Decimal | number; paymentDate: Date; paymentMethod: string; reference: string }) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, companyId: user.companyId, deletedAt: null }, select: { name: true } });
    let category = await this.prisma.expenseCategory.findFirst({ where: { companyId: user.companyId, name: "Procurement", deletedAt: null } });
    if (!category) {
      category = await this.prisma.expenseCategory.create({
        data: { companyId: user.companyId, name: "Procurement", code: "PROCUREMENT", description: "Supplier/vendor payments", createdById: user.id },
      });
    }
    await this.prisma.expense.create({
      data: {
        companyId: user.companyId,
        categoryId: category.id,
        reference: `PRC-${payment.reference}`.slice(0, 30),
        amount: payment.amount,
        description: `Procurement payment ${payment.reference}${supplier ? ` — ${supplier.name}` : ""}`.slice(0, 240),
        expenseDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod as never,
        vendorName: supplier?.name,
        status: "APPROVED" as never,
        submittedById: user.id,
        approvedById: user.id,
        approvedAt: new Date(),
        createdById: user.id,
      },
    });
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
      take: 200,
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
      take: 200,
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

  private async updatePOReceivedQty(purchaseOrderId: string, companyId: string, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const po = await client.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true, grnRecords: { where: { deletedAt: null, status: { in: ["RECEIVED", "QUALITY_PASSED", "POSTED"] } }, include: { items: true } } },
    });
    if (!po) return;

    const allGrnItems = po.grnRecords.flatMap((g) => g.items);
    const totalQty = po.items.reduce((s, i) => s + num(i.quantity), 0);
    const receivedQty = allGrnItems.reduce((s, i) => s + num(i.receivedQty), 0);

    // L3: PurchaseOrderItem.receivedQty was declared but never written back
    // to — it sat at its default 0 forever with no per-line fulfillment
    // tracking, even though the PO-level status above already depends on
    // this exact same GRN item data.
    const receivedByLine = new Map<string, number>();
    for (const item of allGrnItems) {
      if (!item.purchaseOrderItemId) continue;
      receivedByLine.set(item.purchaseOrderItemId, (receivedByLine.get(item.purchaseOrderItemId) ?? 0) + num(item.receivedQty));
    }
    await Promise.all(
      po.items.map((line) =>
        client.purchaseOrderItem.update({ where: { id: line.id }, data: { receivedQty: receivedByLine.get(line.id) ?? 0 } })
      )
    );

    let newStatus = po.status;
    if (receivedQty >= totalQty) newStatus = "FULLY_RECEIVED";
    else if (receivedQty > 0) newStatus = "PARTIALLY_RECEIVED";

    await client.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: newStatus as never } });
  }

  // createGRN/postGRN previously only checked the warehouse belonged to the
  // company, never that the *user* had access to it — a PROCUREMENT_MANAGE
  // holder not assigned to a warehouse could still receive goods into and
  // post real stock for it.
  // (2026-08-26) Missing the "empty array means unrestricted" check used
  // elsewhere in this codebase — a user with no explicit warehouse
  // restrictions (the normal, common case) was blocked from every
  // warehouse-scoped write, since an empty array can never .includes()
  // anything.
  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0 && !user.warehouseIds.includes(warehouseId)) {
      throw new ForbiddenException("You do not have access to this warehouse.");
    }
  }

  // M-BUG (2026-08-13): list/detail endpoints for requests, orders, goods
  // receipts, invoices, and payments had no branch scoping at all — a
  // branch-restricted user could see every other branch's purchasing data
  // just by omitting the branchId filter (or passing another branch's id
  // directly). Matches the "Aug 5" convention used everywhere else:
  // unrestricted for a global user or one with zero branch assignments,
  // otherwise limited to their own branches — with records that genuinely
  // have no branch attached left visible rather than guessed at.
  private branchRestricted(user: AuthenticatedUser) {
    return !user.hasGlobalAccess && user.branchIds.length > 0;
  }

  // Segregation-of-duties toggle for purchase request / purchase order
  // approval. Default ON (a different person must approve). A one-person
  // procurement setup turns it off under Settings → User Access. Mirrors
  // FeedProductionService.requiresSeparateApprover.
  private async requiresSeparateApprover(companyId: string): Promise<boolean> {
    const row = await this.prisma.systemSetting.findFirst({
      where: { companyId, key: "user-access.settings", deletedAt: null },
      select: { value: true }
    });
    const value = (row?.value ?? {}) as { requireSeparateProcurementApprover?: boolean };
    return value.requireSeparateProcurementApprover !== false;
  }
}


