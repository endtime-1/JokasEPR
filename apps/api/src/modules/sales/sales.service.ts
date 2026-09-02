import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { PaymentMethod, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { nextRef } from "../../common/next-ref";
import { withDbRetry } from "../../common/db-retry";
import {
  CreateCustomerDto,
  CreateCustomerGroupDto,
  CreatePaymentDto,
  CreatePriceListDto,
  ConvertSalesQuoteDto,
  CreateProspectVisitDto,
  CreateSalesOrderDto,
  CreateSalesOrderItemDto,
  CreateSalesQuoteDto,
  CreateSalesReturnDto,
  DecideSalesQuoteDto,
  ProspectVisitQueryDto,
  RaiseShortagePurchaseRequestDto,
  SalesQueryDto,
  UpdateSalesOrderDto,
  UpdateSalesQuoteDto,
  UpdateCustomerDto,
  UpdateCustomerGroupDto,
  UpdatePriceListDto
} from "./dto/sales.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type Scope = {
  branchId?: string;
  warehouseId?: string;
};

type InventoryItemContext = {
  id: string;
  companyId: string;
  branchId: string;
  farmId: string | null;
  warehouseId: string;
  productionSiteId: string | null;
  productId: string;
  uomId: string;
  quantityOnHand: Prisma.Decimal;
};

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async dashboard(user: AuthenticatedUser, query: SalesQueryDto) {
    const where = this.orderWhere(user, query);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const now = new Date();
    const [orders, invoiceAgg, paymentAgg, returnAgg, topProducts, topCustomers, todayOrders, todayPayments, todayInvoices, creditLimits, overdueInvoices] = await Promise.all([
      this.prisma.salesOrder.findMany({ where, include: { customer: true, warehouse: true }, orderBy: { orderDate: "desc" }, take: 12 }),
      this.prisma.invoice.aggregate({ where: this.invoiceWhere(user, query), _sum: { totalAmount: true, balanceDue: true } }),
      this.prisma.payment.aggregate({ where: this.paymentWhere(user, query), _sum: { amount: true } }),
      this.prisma.salesReturn.aggregate({ where: this.returnWhere(user, query), _sum: { totalAmount: true } }),
      this.salesByProduct(user, query),
      this.salesByCustomer(user, query),
      this.prisma.salesOrder.aggregate({ where: { ...where, orderDate: { gte: startOfToday } }, _count: true, _sum: { totalAmount: true } }),
      this.prisma.payment.aggregate({ where: { ...this.paymentWhere(user, query), paymentDate: { gte: startOfToday } }, _sum: { amount: true } }),
      this.prisma.invoice.aggregate({ where: { ...this.invoiceWhere(user, query), invoiceDate: { gte: startOfToday } }, _sum: { totalAmount: true } }),
      this.prisma.customerCreditLimit.findMany({ where: { companyId: user.companyId, deletedAt: null, creditLimit: { gt: 0 } }, select: { creditLimit: true, currentBalance: true } }),
      this.prisma.invoice.count({ where: { ...this.invoiceWhere(user, query), status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] }, dueDate: { lt: now } } })
    ]);

    const customersOverLimit = (creditLimits ?? []).filter((c) => Number(c.currentBalance) > Number(c.creditLimit)).length;

    return {
      data: {
        salesValue: Number(invoiceAgg._sum.totalAmount ?? 0),
        paidValue: Number(paymentAgg._sum.amount ?? 0),
        outstandingDebt: Number(invoiceAgg._sum.balanceDue ?? 0),
        returnValue: Number(returnAgg._sum.totalAmount ?? 0),
        pendingStockApprovals: orders.filter((order) => order.status === "PENDING_STOCK_APPROVAL").length,
        fulfilledOrders: orders.filter((order) => order.status === "FULFILLED").length,
        today: {
          ordersCount: todayOrders?._count ?? 0,
          ordersValue: Number(todayOrders?._sum?.totalAmount ?? 0),
          revenueCollected: Number(todayPayments?._sum?.amount ?? 0),
          invoicedValue: Number(todayInvoices?._sum?.totalAmount ?? 0)
        },
        debtors: {
          totalOutstanding: Number(invoiceAgg._sum.balanceDue ?? 0),
          customersOverLimit,
          overdueInvoices: overdueInvoices ?? 0
        },
        recentOrders: orders,
        topProducts,
        topCustomers
      }
    };
  }

  async options(user: AuthenticatedUser) {
    const [branches, warehouses, products, customerGroups, customers, priceLists, invoices] = await Promise.all([
      this.prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.branchIds.length === 0 ? {} : { id: { in: user.branchIds } }) }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.warehouse.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { id: { in: user.warehouseIds } }) }, select: { id: true, branchId: true, code: true, name: true }, orderBy: { name: "asc" } }),
      // (readiness review 2026-08-24) Was unfiltered by type — raw materials
      // (feed ingredients, etc.) were showing up in the sales-order product
      // picker even though customers never buy raw ingredients directly.
      // Excludes RAW_MATERIAL only (not narrowed to FINISHED_GOOD alone) so
      // sellable SEMI_FINISHED/CONSUMABLE items (e.g. soya cake) still show.
      this.prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE", type: { not: "RAW_MATERIAL" } }, select: { id: true, sku: true, name: true, uomId: true, feedForm: true }, orderBy: { name: "asc" } }),
      this.prisma.customerGroup.findMany({ where: this.customerGroupWhere(user, {}), select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.customer.findMany({ where: this.customerWhere(user, {}), select: { id: true, code: true, name: true, customerGroupId: true }, orderBy: { name: "asc" } }),
      this.prisma.priceList.findMany({ where: this.priceListWhere(user, {}), include: { product: { select: { sku: true, name: true } }, customerGroup: { select: { code: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.invoice.findMany({ where: { ...this.invoiceWhere(user, {}), status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, select: { id: true, invoiceNumber: true, customerId: true, balanceDue: true }, orderBy: { invoiceDate: "desc" }, take: 100 })
    ]);
    return { data: { branches, warehouses, products, customerGroups, customers, priceLists, invoices } };
  }

  async listCustomerGroups(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.customerGroup.findMany({ where: this.customerGroupWhere(user, query), include: { branch: true, customers: { where: { deletedAt: null } } }, orderBy: { name: "asc" } });
    return { data };
  }

  async createCustomerGroup(user: AuthenticatedUser, dto: CreateCustomerGroupDto, context: RequestContext) {
    this.assertBranchAccess(user, dto.branchId);
    const data = await this.prisma.customerGroup.create({
      data: { companyId: user.companyId, branchId: dto.branchId, code: dto.code.toUpperCase(), name: dto.name, description: dto.description, createdById: user.id }
    });
    await this.writeAudit(user, "CREATE", "CustomerGroup", data.id, `Created customer group ${data.code}`, context, { branchId: dto.branchId });
    return { data };
  }

  async updateCustomerGroup(user: AuthenticatedUser, id: string, dto: UpdateCustomerGroupDto, context: RequestContext) {
    const group = await this.prisma.customerGroup.findFirst({ where: { ...this.customerGroupWhere(user, {}), id } });
    if (!group) throw new NotFoundException("Customer group was not found.");
    if (dto.branchId) this.assertBranchAccess(user, dto.branchId);
    const data = await this.prisma.customerGroup.update({
      where: { id },
      data: { branchId: dto.branchId, name: dto.name, description: dto.description, updatedById: user.id }
    });
    await this.writeAudit(user, "UPDATE", "CustomerGroup", id, `Updated customer group ${data.code}`, context, { branchId: data.branchId ?? undefined });
    return { data };
  }

  async deleteCustomerGroup(user: AuthenticatedUser, id: string, context: RequestContext) {
    const group = await this.prisma.customerGroup.findFirst({ where: { ...this.customerGroupWhere(user, {}), id } });
    if (!group) throw new NotFoundException("Customer group was not found.");
    const assignedCustomers = await this.prisma.customer.count({ where: { companyId: user.companyId, customerGroupId: id, deletedAt: null } });
    if (assignedCustomers > 0) {
      throw new BadRequestException(`Cannot delete customer group "${group.code}" — ${assignedCustomers} customer(s) are still assigned to it. Reassign them first.`);
    }
    // @@unique([companyId, code]) isn't deletedAt-aware — without rewriting
    // the code here, deleting a customer group and recreating one with the
    // same code fails the create with a unique-constraint error.
    const data = await this.prisma.customerGroup.update({ where: { id }, data: { code: `${group.code}__deleted_${id}`, deletedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "DELETE", "CustomerGroup", id, `Deleted customer group ${group.code}`, context, { branchId: group.branchId ?? undefined });
    return { data };
  }

  async listCustomers(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.customer.findMany({
      where: this.customerWhere(user, query),
      include: { branch: true, customerGroup: true, creditLimits: { where: { deletedAt: null } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return { data };
  }

  async createCustomer(user: AuthenticatedUser, dto: CreateCustomerDto, context: RequestContext) {
    this.assertBranchAccess(user, dto.branchId);
    const data = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          companyId: user.companyId,
          branchId: dto.branchId,
          customerGroupId: dto.customerGroupId,
          code: dto.code.toUpperCase(),
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          status: dto.status ?? "ACTIVE",
          createdById: user.id
        }
      });
      if ((dto.creditLimit ?? 0) > 0) {
        await tx.customerCreditLimit.create({
          data: { companyId: user.companyId, branchId: dto.branchId, customerId: customer.id, creditLimit: dto.creditLimit!, currentBalance: 0, approvedById: user.id, approvedAt: new Date(), createdById: user.id }
        });
      }
      return customer;
    });
    await this.writeAudit(user, "CREATE", "Customer", data.id, `Created customer ${data.code}`, context, { branchId: dto.branchId });
    return { data };
  }

  async getCustomer(user: AuthenticatedUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { ...this.customerWhere(user, {}), id },
      include: {
        branch: true,
        customerGroup: true,
        creditLimits: { where: { deletedAt: null } },
        salesOrders: { where: { deletedAt: null }, orderBy: { orderDate: "desc" }, take: 20 },
        invoices: { where: { deletedAt: null }, orderBy: { invoiceDate: "desc" }, take: 20 },
        payments: { where: { deletedAt: null }, orderBy: { paymentDate: "desc" }, take: 20 },
        statements: { orderBy: { entryDate: "desc" }, take: 50 }
      }
    });
    if (!customer) throw new NotFoundException("Customer was not found.");
    return { data: customer };
  }

  async updateCustomer(user: AuthenticatedUser, id: string, dto: UpdateCustomerDto, context: RequestContext) {
    const customer = await this.prisma.customer.findFirst({ where: { ...this.customerWhere(user, {}), id } });
    if (!customer) throw new NotFoundException("Customer was not found.");
    if (dto.branchId) this.assertBranchAccess(user, dto.branchId);
    const data = await this.prisma.customer.update({
      where: { id },
      data: {
        branchId: dto.branchId,
        customerGroupId: dto.customerGroupId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        status: dto.status,
        updatedById: user.id
      }
    });
    await this.writeAudit(user, "UPDATE", "Customer", id, `Updated customer ${data.code}`, context, { branchId: data.branchId });
    return { data };
  }

  // A customer with unresolved money on the books (open orders, unpaid
  // invoices, or a non-zero credit balance) is blocked from deletion —
  // soft-deleting it would silently orphan that history instead of
  // surfacing it, matching the dependent-record guard every other module's
  // delete already enforces (see e.g. FlockBatch/FeedFormula deletes).
  async deleteCustomer(user: AuthenticatedUser, id: string, context: RequestContext) {
    const customer = await this.prisma.customer.findFirst({ where: { ...this.customerWhere(user, {}), id } });
    if (!customer) throw new NotFoundException("Customer was not found.");

    const [activeOrders, liveInvoices, creditLimit] = await Promise.all([
      this.prisma.salesOrder.count({ where: { companyId: user.companyId, customerId: id, status: { notIn: ["FULFILLED", "CANCELLED"] }, deletedAt: null } }),
      this.prisma.invoice.count({ where: { companyId: user.companyId, customerId: id, status: { notIn: ["PAID", "VOID"] }, deletedAt: null } }),
      this.prisma.customerCreditLimit.findFirst({ where: { companyId: user.companyId, customerId: id, deletedAt: null } })
    ]);
    if (activeOrders > 0) {
      throw new BadRequestException(`Cannot delete customer "${customer.code}" — it has ${activeOrders} active sales order(s). Fulfill or cancel them first.`);
    }
    if (liveInvoices > 0) {
      throw new BadRequestException(`Cannot delete customer "${customer.code}" — it has ${liveInvoices} unpaid invoice(s). Settle them first.`);
    }
    const outstandingBalance = Number(creditLimit?.currentBalance ?? 0);
    if (outstandingBalance > 0) {
      throw new BadRequestException(`Cannot delete customer "${customer.code}" — it has an outstanding balance of ${outstandingBalance.toFixed(2)}. Settle the balance first.`);
    }

    // @@unique([companyId, code]) isn't deletedAt-aware — without rewriting
    // the code here, deleting a customer and recreating one with the same
    // code fails the create with a unique-constraint error.
    const data = await this.prisma.customer.update({ where: { id }, data: { code: `${customer.code}__deleted_${id}`, deletedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "DELETE", "Customer", id, `Deleted customer ${customer.code}`, context, { branchId: customer.branchId });
    return { data };
  }

  async listPriceLists(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.priceList.findMany({ where: this.priceListWhere(user, query), include: { product: true, branch: true, customerGroup: true }, orderBy: { createdAt: "desc" }, take: 200 });
    return { data };
  }

  async createPriceList(user: AuthenticatedUser, dto: CreatePriceListDto, context: RequestContext) {
    if (dto.branchId) this.assertBranchAccess(user, dto.branchId);
    const data = await this.prisma.priceList.create({
      data: {
        companyId: user.companyId,
        branchId: dto.branchId,
        customerGroupId: dto.customerGroupId,
        productId: dto.productId,
        name: dto.name,
        unitPrice: dto.unitPrice,
        currency: dto.currency ?? "GHS",
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
        createdById: user.id
      }
    });
    await this.writeAudit(user, "CREATE", "PriceList", data.id, `Created price list ${data.name}`, context, { branchId: dto.branchId });
    return { data };
  }

  async updatePriceList(user: AuthenticatedUser, id: string, dto: UpdatePriceListDto, context: RequestContext) {
    const priceList = await this.prisma.priceList.findFirst({ where: { ...this.priceListWhere(user, {}), id } });
    if (!priceList) throw new NotFoundException("Price list was not found.");
    if (dto.branchId) this.assertBranchAccess(user, dto.branchId);
    const data = await this.prisma.priceList.update({
      where: { id },
      data: {
        branchId: dto.branchId,
        customerGroupId: dto.customerGroupId,
        productId: dto.productId,
        name: dto.name,
        unitPrice: dto.unitPrice,
        currency: dto.currency,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
        updatedById: user.id
      }
    });
    await this.writeAudit(user, "UPDATE", "PriceList", id, `Updated price list ${data.name}`, context, { branchId: data.branchId ?? undefined });
    return { data };
  }

  async deletePriceList(user: AuthenticatedUser, id: string, context: RequestContext) {
    const priceList = await this.prisma.priceList.findFirst({ where: { ...this.priceListWhere(user, {}), id } });
    if (!priceList) throw new NotFoundException("Price list was not found.");
    const data = await this.prisma.priceList.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "DELETE", "PriceList", id, `Deleted price list ${priceList.name}`, context, { branchId: priceList.branchId ?? undefined });
    return { data };
  }

  async listOrders(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.salesOrder.findMany({
      where: this.orderWhere(user, query),
      include: { customer: true, warehouse: true, items: { include: { product: true } }, invoices: true, deliveryNotes: true },
      orderBy: { orderDate: "desc" },
      take: 200
    });
    return { data };
  }

  async createOrder(user: AuthenticatedUser, dto: CreateSalesOrderDto, context: RequestContext) {
    if (!dto.items.length) throw new BadRequestException("Sales order must contain at least one item.");
    // Mobile parity audit (2026-08-17): mirrors createPayment's idempotencyKey
    // handling below — a mobile offline-queue resend (or a client retry after
    // a dropped response) carrying the same idempotencyKey replays the
    // original order instead of creating a second one.
    if (dto.idempotencyKey) {
      const existing = await this.findOrderByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    // L-BACK: the order-level total guard below already blocks the
    // aggregate from going negative, but nothing stopped a single line's
    // discountAmount from exceeding its own quantity*unitPrice — cosmetic
    // (never let real money go out wrong, since the aggregate guard still
    // holds), but a negative line total is never a legitimate value.
    const overDiscounted = dto.items.find((item) => (item.discountAmount ?? 0) > item.quantity * item.unitPrice);
    if (overDiscounted) throw new BadRequestException("A line's discount cannot exceed that line's own total.");
    const [customer, warehouse] = await Promise.all([
      this.prisma.customer.findFirst({ where: { companyId: user.companyId, id: dto.customerId, deletedAt: null } }),
      this.prisma.warehouse.findFirst({ where: { companyId: user.companyId, id: dto.warehouseId, deletedAt: null } })
    ]);
    if (!customer) throw new NotFoundException("Customer was not found.");
    if (customer.status !== "ACTIVE") throw new BadRequestException("Inactive or on-hold customers cannot place new orders.");
    if (!warehouse) throw new NotFoundException("Warehouse was not found.");
    if (warehouse.branchId !== customer.branchId) throw new BadRequestException("Sales warehouse must belong to the customer's branch.");
    this.assertBranchAccess(user, customer.branchId);

    // C4 (DB stability audit, 2026-08-16): productId was never validated as
    // belonging to the caller's company before being persisted — only its
    // UUID shape was checked at the DTO level. Since the create response (and
    // every later list/detail read) includes the full `product` relation,
    // supplying a foreign company's productId embedded that company's
    // product name/SKU/description/QuickBooks IDs in this order, persistently.
    // createReturn already does this exact check; createOrder just never did.
    const requestedProductIds = [...new Set(dto.items.map((item) => item.productId))];
    const ownedProducts = await this.prisma.product.findMany({ where: { companyId: user.companyId, id: { in: requestedProductIds }, deletedAt: null }, select: { id: true } });
    if (ownedProducts.length !== requestedProductIds.length) {
      throw new NotFoundException("One or more products were not found.");
    }

    // Check stock levels — informational only, never blocks the order
    const stockChecks = await Promise.all(dto.items.map((item) => this.availableStock(user.companyId, dto.warehouseId, item.productId)));
    const itemsWithStock = dto.items.map((item, i) => ({ item, available: stockChecks[i] }));
    const shortItems = itemsWithStock.filter(({ item, available }) => available < item.quantity);

    const subtotal = dto.items.reduce((sum, item) => sum + this.lineTotal(item), 0);
    const discountAmount = dto.discountAmount ?? 0;
    const taxAmount = dto.taxAmount ?? 0;
    const totalAmount = subtotal - discountAmount + taxAmount;
    if (totalAmount < 0) throw new BadRequestException("Sales order total cannot be negative.");

    await this.assertCreditLimit(customer.id, totalAmount);
    const orderNumber = await nextRef(this.prisma, user.companyId, "SO");
    let data;
    try {
      data = await this.prisma.salesOrder.create({
        data: {
          companyId: user.companyId,
          branchId: customer.branchId,
          customerId: customer.id,
          warehouseId: warehouse.id,
          orderNumber,
          orderDate: dto.orderDate ? new Date(dto.orderDate) : new Date(),
          status: "PENDING_STOCK_APPROVAL",
          subtotal,
          discountAmount,
          taxAmount,
          totalAmount,
          balanceDue: totalAmount,
          salespersonId: user.id,
          notes: dto.notes,
          idempotencyKey: dto.idempotencyKey,
          createdById: user.id,
          items: {
            create: dto.items.map((item) => ({ companyId: user.companyId, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount ?? 0, lineTotal: this.lineTotal(item) }))
          }
        },
        include: { items: { include: { product: true } }, customer: true, warehouse: true }
      });
    } catch (err: unknown) {
      // Same race-window reasoning as createPayment's own P2002 handling —
      // the pre-check above isn't atomic, so the unique (companyId,
      // idempotencyKey) index is the real, race-safe arbiter.
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findOrderByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.writeAudit(user, "CREATE", "SalesOrder", data.id, `Created sales order ${orderNumber}`, context, { branchId: customer.branchId, warehouseId: warehouse.id });

    // Fire production + procurement alerts for any short items (non-blocking
    // — a failure here shouldn't fail the sales order that already
    // succeeded, but this used to swallow it completely silently while its
    // neighbor below was already fixed for the identical failure mode).
    if (shortItems.length > 0) {
      void this.fireStockShortageAlerts(user.companyId, customer.branchId, orderNumber, shortItems).catch((err) =>
        this.logger.error(`Stock shortage alert failed for sales order ${orderNumber}: ${err instanceof Error ? err.message : err}`)
      );
    }

    // Auto-generate draft production orders for all items (non-blocking —
    // a failure here shouldn't fail the sales order that already succeeded,
    // but silently swallowing it meant a real failure, e.g. an orderNumber
    // collision, left production planning silently short with no trace).
    void this.autoGenerateProductionOrders(user.companyId, customer.branchId, orderNumber, data.id, dto.items, user.id).catch((err) =>
      this.logger.error(`Auto production-order generation failed for sales order ${orderNumber}: ${err instanceof Error ? err.message : err}`)
    );

    return { data };
  }

  async getOrder(user: AuthenticatedUser, id: string) {
    const data = await this.prisma.salesOrder.findFirst({
      where: { companyId: user.companyId, id, deletedAt: null },
      include: { customer: true, warehouse: true, items: { include: { product: true } }, invoices: true, deliveryNotes: true }
    });
    if (!data) throw new NotFoundException("Sales order was not found.");
    this.assertBranchAccess(user, data.branchId);
    return { data };
  }

  async updateSalesOrder(user: AuthenticatedUser, id: string, dto: UpdateSalesOrderDto, context: RequestContext) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { companyId: user.companyId, id, deletedAt: null },
      include: { items: true, invoices: true }
    });
    if (!order) throw new NotFoundException("Sales order was not found.");
    this.assertBranchAccess(user, order.branchId);
    if (order.status !== "PENDING_STOCK_APPROVAL") {
      throw new BadRequestException(`Only a pending sales order can be edited — this one is ${order.status.toLowerCase()}.`);
    }
    if (order.invoices.length) throw new BadRequestException("This order already has an invoice — it can't be edited.");

    if (dto.items) {
      if (!dto.items.length) throw new BadRequestException("A sales order must contain at least one item.");
      const overDiscounted = dto.items.find((it) => (it.discountAmount ?? 0) > it.quantity * it.unitPrice);
      if (overDiscounted) throw new BadRequestException("A line's discount cannot exceed that line's own total.");
      const productIds = [...new Set(dto.items.map((it) => it.productId))];
      const owned = await this.prisma.product.findMany({ where: { companyId: user.companyId, id: { in: productIds }, deletedAt: null }, select: { id: true } });
      if (owned.length !== productIds.length) throw new NotFoundException("One or more products were not found.");
    }

    const subtotal = dto.items ? dto.items.reduce((s, it) => s + this.lineTotal(it), 0) : Number(order.subtotal);
    const discountAmount = dto.discountAmount ?? Number(order.discountAmount);
    const taxAmount = dto.taxAmount ?? Number(order.taxAmount);
    const totalAmount = subtotal - discountAmount + taxAmount;
    if (totalAmount < 0) throw new BadRequestException("Sales order total cannot be negative.");
    await this.assertCreditLimit(order.customerId, totalAmount);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.salesOrderItem.deleteMany({ where: { salesOrderId: id } });
        await tx.salesOrderItem.createMany({
          data: dto.items.map((it) => ({ companyId: user.companyId, salesOrderId: id, productId: it.productId, quantity: it.quantity, unitPrice: it.unitPrice, discountAmount: it.discountAmount ?? 0, lineTotal: this.lineTotal(it) }))
        });
      }
      return tx.salesOrder.update({
        where: { id },
        data: {
          subtotal, discountAmount, taxAmount, totalAmount, balanceDue: totalAmount,
          ...(dto.notes !== undefined && { notes: dto.notes }),
          updatedById: user.id
        },
        include: { items: { include: { product: true } }, customer: true, warehouse: true }
      });
    });
    await this.writeAudit(user, "UPDATE", "SalesOrder", id, `Edited sales order ${order.orderNumber}`, context, { branchId: order.branchId, warehouseId: order.warehouseId });
    return { data: updated };
  }

  async cancelSalesOrder(user: AuthenticatedUser, id: string, context: RequestContext) {
    const order = await this.prisma.salesOrder.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!order) throw new NotFoundException("Sales order was not found.");
    this.assertBranchAccess(user, order.branchId);
    if (order.status !== "PENDING_STOCK_APPROVAL") {
      throw new BadRequestException(`Only a pending sales order can be cancelled — this one is ${order.status.toLowerCase()}.`);
    }
    const updated = await this.prisma.salesOrder.update({ where: { id }, data: { status: "CANCELLED", updatedById: user.id } });
    await this.writeAudit(user, "UPDATE", "SalesOrder", id, `Cancelled sales order ${order.orderNumber}`, context, { branchId: order.branchId });
    return { data: updated };
  }

  async approveStockRelease(user: AuthenticatedUser, id: string, context: RequestContext) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { companyId: user.companyId, id, deletedAt: null },
      include: { items: true, customer: true, warehouse: true, invoices: true }
    });
    if (!order) throw new NotFoundException("Sales order was not found.");
    this.assertWarehouseAccess(user, order.warehouseId);
    if (!["PENDING_STOCK_APPROVAL", "APPROVED"].includes(order.status)) throw new BadRequestException("Only pending sales orders can be released.");

    // Named, actionable shortage message — previously a flat "Inventory item
    // was not found for one or more sales order items" whether the product
    // simply had 0 on hand or had never been stocked into this warehouse at
    // all, with no indication of which item or by how much. orderShortage()
    // below surfaces the same numbers proactively, before an approval is
    // even attempted.
    const productIds = order.items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // High (DB stability audit, 2026-08-16): this locks StockBatch then
    // InventoryItem via consumeFifoTx, while Poultry/Soya/Market-Planning/
    // Feed-Production lock the opposite order for the same tables — a
    // genuine InnoDB deadlock risk under concurrent stock writes. Retrying
    // the whole transaction on Prisma's P2034 (Prisma's own documented
    // response to a deadlock) turns that from a hard user-visible failure
    // into a transparent retry.
    const data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const inventoryItem = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: order.warehouseId, productId: item.productId, deletedAt: null } });
        const onHand = inventoryItem ? Number(inventoryItem.quantityOnHand) : 0;
        if (!inventoryItem || onHand < Number(item.quantity)) {
          const product = productMap.get(item.productId);
          const label = product ? `${product.name} (${product.sku})` : item.productId;
          throw new BadRequestException(
            `Not enough stock to release "${label}" from ${order.warehouse.name} — need ${Number(item.quantity)}, have ${onHand}. Stock it in, or raise a purchase request for the shortfall from this order.`
          );
        }
        await this.consumeFifoTx(tx, user, inventoryItem, Number(item.quantity), "SalesOrder", order.id, `Sales release ${order.orderNumber}`);
      }

      const invoice = order.invoices[0] ?? (await tx.invoice.create({
        data: {
          companyId: user.companyId,
          branchId: order.branchId,
          customerId: order.customerId,
          salesOrderId: order.id,
          invoiceNumber: await nextRef(tx, user.companyId, "INV"),
          invoiceDate: new Date(),
          dueDate: this.daysFromNow(14),
          status: "ISSUED",
          subtotal: order.subtotal,
          discountAmount: order.discountAmount,
          taxAmount: order.taxAmount,
          totalAmount: order.totalAmount,
          balanceDue: order.totalAmount,
          createdById: user.id
        }
      }));
      const deliveryNote = await tx.deliveryNote.create({
        data: {
          companyId: user.companyId,
          branchId: order.branchId,
          salesOrderId: order.id,
          warehouseId: order.warehouseId,
          deliveryNumber: await nextRef(tx, user.companyId, "DN"),
          status: "RELEASED",
          releasedById: user.id,
          createdById: user.id
        }
      });
      await tx.salesOrder.update({ where: { id: order.id }, data: { status: "FULFILLED", stockApprovedById: user.id, stockApprovedAt: new Date(), updatedById: user.id } });
      await this.addCustomerDebitTx(tx, order.customerId, order.branchId, invoice.id, Number(order.totalAmount), `Invoice ${invoice.invoiceNumber}`);
      return { invoice, deliveryNote };
    }), { label: "SalesOrder.approveStockRelease" });

    await this.writeAudit(user, "APPROVE", "SalesOrder", order.id, `Approved stock release for ${order.orderNumber}`, context, { branchId: order.branchId, warehouseId: order.warehouseId });
    return { data };
  }

  // What actually blocks approve-stock-release, laid out per line so the UI
  // can show it before (or instead of) a failed approval attempt, and so
  // raiseShortagePurchaseRequest below knows exactly what to request.
  async orderShortage(user: AuthenticatedUser, id: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { companyId: user.companyId, id, deletedAt: null },
      include: { items: true, warehouse: { select: { id: true, name: true } } }
    });
    if (!order) throw new NotFoundException("Sales order was not found.");
    this.assertWarehouseAccess(user, order.warehouseId);

    const productIds = order.items.map((item) => item.productId);
    const [products, inventoryItems] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true, uom: { select: { symbol: true } } } }),
      this.prisma.inventoryItem.findMany({ where: { companyId: user.companyId, warehouseId: order.warehouseId, productId: { in: productIds }, deletedAt: null }, select: { productId: true, quantityOnHand: true } })
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const stockMap = new Map(inventoryItems.map((i) => [i.productId, Number(i.quantityOnHand)]));

    const shortages = order.items
      .map((item) => {
        const available = stockMap.get(item.productId) ?? 0;
        const ordered = Number(item.quantity);
        return {
          productId: item.productId,
          product: productMap.get(item.productId) ?? null,
          ordered,
          available,
          shortBy: Math.max(0, ordered - available),
          unitPrice: Number(item.unitPrice)
        };
      })
      .filter((row) => row.shortBy > 0);

    return { data: { orderId: order.id, orderNumber: order.orderNumber, warehouse: order.warehouse, canApprove: shortages.length === 0, shortages } };
  }

  async raiseShortagePurchaseRequest(user: AuthenticatedUser, id: string, dto: RaiseShortagePurchaseRequestDto, context: RequestContext) {
    const { data: shortage } = await this.orderShortage(user, id);
    if (!shortage.shortages.length) {
      throw new BadRequestException("This order has no stock shortage — nothing to raise a purchase request for.");
    }
    const order = await this.prisma.salesOrder.findFirst({ where: { companyId: user.companyId, id }, select: { id: true, orderNumber: true, branchId: true } });
    if (!order) throw new NotFoundException("Sales order was not found.");

    const reference = await nextRef(this.prisma, user.companyId, "PR");
    const items = shortage.shortages.map((row, index) => ({
      productId: row.productId,
      productName: row.product?.name ?? row.productId,
      quantity: row.shortBy,
      uomCode: row.product?.uom?.symbol ?? "UNIT",
      estimatedUnitCost: row.unitPrice || undefined,
      description: `Shortfall for sales order ${order.orderNumber} — ordered ${row.ordered}, in stock ${row.available}`,
      sequence: index + 1
    }));
    const totalEstimate = shortage.shortages.reduce((sum, row) => sum + row.shortBy * row.unitPrice, 0);

    const row = await this.prisma.purchaseRequest.create({
      data: {
        companyId: user.companyId,
        reference,
        title: `Stock shortage — Sales Order ${order.orderNumber}`,
        salesOrderId: order.id,
        requestedById: user.id,
        branchId: order.branchId,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
        totalEstimate,
        notes: dto.notes ?? `Raised from sales order ${order.orderNumber}'s stock shortage.`,
        createdById: user.id,
        items: { create: items }
      } as Prisma.PurchaseRequestUncheckedCreateInput,
      include: { items: true }
    });
    await this.writeAudit(user, "CREATE", "PurchaseRequest", row.id, `Raised purchase request ${reference} for sales order ${order.orderNumber} shortage`, context, { branchId: order.branchId ?? undefined });
    return { data: row };
  }

  // ── Proforma / Quotations ──────────────────────────────────────────────────
  // A quote reserves no stock and posts nothing to Finance. On acceptance it
  // converts into a real SalesOrder — that's where credit limits, stock
  // release, and invoicing kick in.

  async listQuotes(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.salesQuote.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        customerId: query.customerId,
        ...(query.status ? { status: query.status as never } : {}),
        ...this.branchScope(user, query)
      },
      include: { customer: { select: { code: true, name: true } }, _count: { select: { items: true } } },
      orderBy: { quoteDate: "desc" },
      take: 200
    });
    return { data };
  }

  async getQuote(user: AuthenticatedUser, id: string) {
    const quote = await this.prisma.salesQuote.findFirst({
      where: { companyId: user.companyId, id, deletedAt: null },
      include: {
        customer: true,
        branch: { select: { name: true, code: true } },
        items: { include: { product: { select: { sku: true, name: true } } }, orderBy: { sequence: "asc" } }
      }
    });
    if (!quote) throw new NotFoundException("Quote was not found.");
    return { data: quote };
  }

  async createQuote(user: AuthenticatedUser, dto: CreateSalesQuoteDto, context: RequestContext) {
    if (!dto.items.length) throw new BadRequestException("A quote must contain at least one item.");
    const overDiscounted = dto.items.find((item) => (item.discountAmount ?? 0) > item.quantity * item.unitPrice);
    if (overDiscounted) throw new BadRequestException("A line's discount cannot exceed that line's own total.");

    const customer = await this.prisma.customer.findFirst({ where: { companyId: user.companyId, id: dto.customerId, deletedAt: null } });
    if (!customer) throw new NotFoundException("Customer was not found.");
    this.assertBranchAccess(user, customer.branchId);

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const ownedProducts = await this.prisma.product.findMany({ where: { companyId: user.companyId, id: { in: productIds }, deletedAt: null }, select: { id: true } });
    if (ownedProducts.length !== productIds.length) throw new NotFoundException("One or more products were not found.");

    const subtotal = dto.items.reduce((sum, item) => sum + this.lineTotal(item), 0);
    const discountAmount = dto.discountAmount ?? 0;
    const taxAmount = dto.taxAmount ?? 0;
    const totalAmount = subtotal - discountAmount + taxAmount;
    if (totalAmount < 0) throw new BadRequestException("Quote total cannot be negative.");

    const quoteNumber = await nextRef(this.prisma, user.companyId, "QT");
    const data = await this.prisma.salesQuote.create({
      data: {
        companyId: user.companyId,
        branchId: customer.branchId,
        customerId: customer.id,
        quoteNumber,
        quoteDate: dto.quoteDate ? new Date(dto.quoteDate) : new Date(),
        validUntil: dto.validUntil ? new Date(dto.validUntil) : this.daysFromNow(14),
        status: "DRAFT",
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        notes: dto.notes,
        createdById: user.id,
        items: {
          create: dto.items.map((item, i) => ({
            companyId: user.companyId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount ?? 0,
            lineTotal: this.lineTotal(item),
            sequence: i + 1
          }))
        }
      },
      include: { items: true, customer: true }
    });
    await this.writeAudit(user, "CREATE", "SalesQuote", data.id, `Created quote ${quoteNumber}`, context, { branchId: customer.branchId });
    return { data };
  }

  async updateQuote(user: AuthenticatedUser, id: string, dto: UpdateSalesQuoteDto, context: RequestContext) {
    const quote = await this.prisma.salesQuote.findFirst({ where: { companyId: user.companyId, id, deletedAt: null }, include: { items: true } });
    if (!quote) throw new NotFoundException("Quote was not found.");
    if (quote.status !== "DRAFT") throw new BadRequestException(`Only a DRAFT quote can be edited — this one is ${quote.status.toLowerCase()}.`);

    let itemData: { subtotal: number; totalAmount: number } | null = null;
    if (dto.items) {
      if (!dto.items.length) throw new BadRequestException("A quote must contain at least one item.");
      const productIds = [...new Set(dto.items.map((i) => i.productId))];
      const owned = await this.prisma.product.findMany({ where: { companyId: user.companyId, id: { in: productIds }, deletedAt: null }, select: { id: true } });
      if (owned.length !== productIds.length) throw new NotFoundException("One or more products were not found.");
      const subtotal = dto.items.reduce((s, i) => s + this.lineTotal(i), 0);
      itemData = { subtotal, totalAmount: subtotal - (dto.discountAmount ?? Number(quote.discountAmount)) + (dto.taxAmount ?? Number(quote.taxAmount)) };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.salesQuoteItem.deleteMany({ where: { salesQuoteId: id } });
        await tx.salesQuoteItem.createMany({
          data: dto.items.map((item, i) => ({
            companyId: user.companyId, salesQuoteId: id, productId: item.productId,
            quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount ?? 0,
            lineTotal: this.lineTotal(item), sequence: i + 1
          }))
        });
      }
      const discountAmount = dto.discountAmount ?? Number(quote.discountAmount);
      const taxAmount = dto.taxAmount ?? Number(quote.taxAmount);
      const subtotal = itemData ? itemData.subtotal : Number(quote.subtotal);
      return tx.salesQuote.update({
        where: { id },
        data: {
          ...(dto.validUntil !== undefined && { validUntil: new Date(dto.validUntil) }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          discountAmount, taxAmount,
          subtotal,
          totalAmount: subtotal - discountAmount + taxAmount,
          updatedById: user.id
        },
        include: { items: true, customer: true }
      });
    });
    await this.writeAudit(user, "UPDATE", "SalesQuote", id, `Edited quote ${quote.quoteNumber}`, context, { branchId: quote.branchId });
    return { data: updated };
  }

  async sendQuote(user: AuthenticatedUser, id: string, context: RequestContext) {
    const quote = await this.requireQuote(user, id);
    if (!["DRAFT", "SENT"].includes(quote.status)) throw new BadRequestException(`A ${quote.status.toLowerCase()} quote cannot be marked as sent.`);
    const data = await this.prisma.salesQuote.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "UPDATE", "SalesQuote", id, `Marked quote ${quote.quoteNumber} as sent`, context, { branchId: quote.branchId });
    return { data };
  }

  async decideQuote(user: AuthenticatedUser, id: string, dto: DecideSalesQuoteDto, context: RequestContext) {
    const quote = await this.requireQuote(user, id);
    if (!["SENT", "DRAFT"].includes(quote.status)) throw new BadRequestException(`A ${quote.status.toLowerCase()} quote cannot be marked ${dto.decision.toLowerCase()}.`);
    const data = await this.prisma.salesQuote.update({ where: { id }, data: { status: dto.decision, decidedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "UPDATE", "SalesQuote", id, `Quote ${quote.quoteNumber} marked ${dto.decision.toLowerCase()}`, context, { branchId: quote.branchId });
    return { data };
  }

  async convertQuoteToOrder(user: AuthenticatedUser, id: string, dto: ConvertSalesQuoteDto, context: RequestContext) {
    const quote = await this.prisma.salesQuote.findFirst({
      where: { companyId: user.companyId, id, deletedAt: null },
      include: { items: true }
    });
    if (!quote) throw new NotFoundException("Quote was not found.");
    if (quote.status === "CONVERTED") throw new BadRequestException("This quote has already been converted to an order.");
    if (["DECLINED", "EXPIRED"].includes(quote.status)) throw new BadRequestException(`A ${quote.status.toLowerCase()} quote cannot be converted.`);

    // Hand off to the normal order flow — credit limit, stock check, and the
    // auto production-order / shortage alerts all belong at order time, not
    // quote time.
    const order = await this.createOrder(
      user,
      {
        customerId: quote.customerId,
        warehouseId: dto.warehouseId,
        orderDate: dto.orderDate,
        discountAmount: Number(quote.discountAmount),
        taxAmount: Number(quote.taxAmount),
        notes: `From quote ${quote.quoteNumber}${quote.notes ? ` — ${quote.notes}` : ""}`.slice(0, 500),
        items: quote.items.map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          discountAmount: Number(it.discountAmount)
        }))
      },
      context
    );
    await this.prisma.salesQuote.update({ where: { id }, data: { status: "CONVERTED", salesOrderId: order.data.id, decidedAt: quote.decidedAt ?? new Date(), updatedById: user.id } });
    await this.writeAudit(user, "UPDATE", "SalesQuote", id, `Converted quote ${quote.quoteNumber} to sales order ${order.data.orderNumber}`, context, { branchId: quote.branchId });
    return { data: order.data };
  }

  async deleteQuote(user: AuthenticatedUser, id: string, context: RequestContext) {
    const quote = await this.requireQuote(user, id);
    if (!["DRAFT", "DECLINED", "EXPIRED"].includes(quote.status)) {
      throw new BadRequestException(`A ${quote.status.toLowerCase()} quote can't be deleted.`);
    }
    await this.prisma.salesQuote.update({ where: { id }, data: { quoteNumber: `${quote.quoteNumber}__deleted_${id}`.slice(0, 180), deletedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "DELETE", "SalesQuote", id, `Deleted quote ${quote.quoteNumber}`, context, { branchId: quote.branchId });
    return { data: { success: true } };
  }

  async quotePdf(user: AuthenticatedUser, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const { data: quote } = await this.getQuote(user, id);
    const company = await this.prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true, legalName: true } });
    const { default: PDFDocument } = await import("pdfkit");
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
    const gh = (n: unknown) => `GHS ${Number(n ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    doc.fontSize(20).font("Helvetica-Bold").text(company?.legalName || company?.name || "Proforma Invoice");
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#555").text("PROFORMA INVOICE");
    doc.fillColor("#000").moveDown(0.6);

    doc.fontSize(9).font("Helvetica-Bold").text("Quote No: ", { continued: true }).font("Helvetica").text(quote.quoteNumber);
    doc.font("Helvetica-Bold").text("Date: ", { continued: true }).font("Helvetica").text(new Date(quote.quoteDate).toLocaleDateString("en-GH"));
    if (quote.validUntil) doc.font("Helvetica-Bold").text("Valid until: ", { continued: true }).font("Helvetica").text(new Date(quote.validUntil).toLocaleDateString("en-GH"));
    doc.font("Helvetica-Bold").text("Bill to: ", { continued: true }).font("Helvetica").text(`${quote.customer.name} (${quote.customer.code})`);
    doc.moveDown(0.8);

    this.pdfQuoteTable(doc, quote.items.map((it) => [
      it.product?.name ?? it.productId,
      String(Number(it.quantity)),
      gh(it.unitPrice),
      Number(it.discountAmount) ? gh(it.discountAmount) : "-",
      gh(it.lineTotal)
    ]));

    doc.moveDown(0.6).fontSize(9);
    const right = (label: string, val: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").text(`${label}   ${val}`, { align: "right" });
    };
    right("Subtotal", gh(quote.subtotal));
    if (Number(quote.discountAmount)) right("Discount", `- ${gh(quote.discountAmount)}`);
    if (Number(quote.taxAmount)) right("Tax", `+ ${gh(quote.taxAmount)}`);
    right("Total", gh(quote.totalAmount), true);

    if (quote.notes) doc.moveDown(1).fontSize(8).fillColor("#555").text(`Notes: ${quote.notes}`).fillColor("#000");
    doc.moveDown(1.5).fontSize(7.5).fillColor("#999").text("This is a proforma invoice for quotation purposes only. It is not a demand for payment and reserves no stock.");

    doc.end();
    return { buffer: await done, filename: `proforma-${quote.quoteNumber}.pdf` };
  }

  private pdfQuoteTable(doc: PDFKit.PDFDocument, rows: string[][]) {
    const head = ["Item", "Qty", "Unit Price", "Discount", "Line Total"];
    const widths = [200, 45, 90, 80, 90];
    const startX = doc.x;
    let y = doc.y;
    doc.fontSize(8.5).font("Helvetica-Bold");
    head.forEach((h, i) => doc.text(h, startX + widths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: widths[i] }));
    y += 16;
    doc.font("Helvetica");
    for (const row of rows) {
      row.forEach((cell, i) => doc.text(cell, startX + widths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: widths[i] }));
      y += 15;
    }
    doc.x = startX;
    doc.y = y + 4;
  }

  private async requireQuote(user: AuthenticatedUser, id: string) {
    const quote = await this.prisma.salesQuote.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!quote) throw new NotFoundException("Quote was not found.");
    this.assertBranchAccess(user, quote.branchId);
    return quote;
  }

  async listInvoices(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.invoice.findMany({ where: this.invoiceWhere(user, query), include: { customer: true, salesOrder: true, payments: true }, orderBy: { invoiceDate: "desc" }, take: 200 });
    return { data };
  }

  async createPayment(user: AuthenticatedUser, dto: CreatePaymentDto, context: RequestContext) {
    const customer = await this.prisma.customer.findFirst({ where: { companyId: user.companyId, id: dto.customerId, deletedAt: null } });
    if (!customer) throw new NotFoundException("Customer was not found.");
    this.assertBranchAccess(user, customer.branchId);
    // H9: a client retry after a timeout (it never learned whether the
    // first attempt landed) used to pass the overpayment guard a second
    // time independently and record a second real payment. A given
    // idempotencyKey has already been recorded once — replay the original
    // result instead of creating a duplicate.
    if (dto.idempotencyKey) {
      const existing = await this.findPaymentByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    const invoice = dto.invoiceId ? await this.prisma.invoice.findFirst({ where: { companyId: user.companyId, id: dto.invoiceId, customerId: customer.id, deletedAt: null } }) : null;
    if (dto.invoiceId && !invoice) throw new NotFoundException("Invoice was not found.");
    if (invoice && Number(invoice.balanceDue) <= 0) throw new BadRequestException("Invoice has no outstanding balance.");
    if (invoice && dto.amount > Number(invoice.balanceDue)) throw new BadRequestException("Payment amount cannot exceed invoice balance.");

    let data;
    try {
      data = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          companyId: user.companyId,
          branchId: customer.branchId,
          customerId: customer.id,
          invoiceId: invoice?.id,
          paymentNumber: await nextRef(tx, user.companyId, "PAY"),
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          idempotencyKey: dto.idempotencyKey,
          receivedById: user.id,
          createdById: user.id
        }
      });
      if (invoice) {
        // Guarded, atomic decrement instead of computing from the
        // pre-transaction snapshot above — two concurrent payments against
        // the same invoice could otherwise both pass the earlier check and
        // both commit, silently double-collecting money (the invoice would
        // show as merely fully paid instead of overpaid). The `gte` guard
        // makes this race-safe: only one concurrent request can succeed once
        // the remaining balance is less than its own amount.
        const decremented = await tx.invoice.updateMany({
          where: { id: invoice.id, balanceDue: { gte: dto.amount } },
          data: { paidAmount: { increment: dto.amount }, balanceDue: { decrement: dto.amount }, updatedById: user.id }
        });
        if (decremented.count === 0) {
          throw new BadRequestException("Payment amount cannot exceed invoice balance.");
        }
        const refreshed = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, select: { balanceDue: true } });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: Number(refreshed.balanceDue) <= 0 ? "PAID" : "PARTIALLY_PAID" }
        });
        if (invoice.salesOrderId) {
          await tx.salesOrder.update({ where: { id: invoice.salesOrderId }, data: { paidAmount: { increment: dto.amount }, balanceDue: { decrement: dto.amount }, updatedById: user.id } });
        }
      }
      await this.addCustomerCreditTx(tx, customer.id, customer.branchId, payment.id, dto.amount, `Payment ${payment.paymentNumber}`);
      const receipt = await tx.receipt.create({
        data: {
          companyId: user.companyId,
          branchId: customer.branchId,
          customerId: customer.id,
          invoiceId: invoice?.id,
          paymentId: payment.id,
          receiptNumber: await nextRef(tx, user.companyId, "RCT"),
          receiptDate: new Date(),
          amount: dto.amount,
          issuedById: user.id,
          createdById: user.id
        }
      });
      return { payment, receipt };
      });
    } catch (err: unknown) {
      // H9: the pre-check above has a race window — two requests carrying
      // the same idempotencyKey can both pass it and both start a
      // transaction. The unique (companyId, idempotencyKey) index makes the
      // DB itself the final arbiter: the loser's insert fails with P2002,
      // and instead of surfacing that as an error, it replays the winner's
      // result — a genuine retry gets the same success response either way.
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findPaymentByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.writeAudit(user, "CREATE", "Payment", data.payment.id, `Recorded payment ${data.payment.paymentNumber}`, context, { branchId: customer.branchId });
    // H21: P&L/Cash Flow reports are built entirely from finance's own
    // Revenue/Expense (and CustomerPayment/SupplierPayment) tables, which
    // only finance's own manual-entry endpoints ever wrote to — real sales
    // revenue lived in Payment/Invoice and was never mirrored in, so those
    // reports materially understated real revenue unless someone re-keyed
    // every sale a second time as a finance entry. Mirrors payroll's own
    // proven pattern (createPayrollExpense, awaited + logged, non-fatal to
    // the payment itself) on the cash-received side, after the payment
    // transaction has actually committed.
    try {
      await this.createSalesRevenue(user, customer, data.payment);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.warn(`Failed to create Finance revenue entry for payment ${data.payment.id} (company ${user.companyId}): ${message}`);
    }
    return { data };
  }

  private async createSalesRevenue(user: AuthenticatedUser, customer: { name: string }, payment: { id: string; amount: Prisma.Decimal | number; paymentDate: Date; method: string; paymentNumber: string; invoiceId: string | null }) {
    let invoiceRef: string | undefined;
    if (payment.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: payment.invoiceId }, select: { invoiceNumber: true } });
      invoiceRef = invoice?.invoiceNumber;
    }
    await this.prisma.revenue.create({
      data: {
        companyId: user.companyId,
        reference: await nextRef(this.prisma, user.companyId, "REV"),
        source: "PRODUCT_SALES",
        description: `Sales payment ${payment.paymentNumber}`.slice(0, 240),
        amount: payment.amount,
        revenueDate: payment.paymentDate,
        paymentMethod: payment.method as never,
        customerName: customer.name,
        invoiceRef,
        createdById: user.id
      }
    });
  }

  // Get-or-create the per-branch "walk-in / cash sales" customer that direct
  // over-the-counter sales (e.g. feed sold straight off the mill floor) are
  // booked against — they have no real customer record and no receivable.
  private async ensureCashCustomerTx(tx: Prisma.TransactionClient, companyId: string, branchId: string, userId: string) {
    const code = `WALK-IN-${branchId}`.slice(0, 40).toUpperCase();
    const existing = await tx.customer.findFirst({ where: { companyId, code, deletedAt: null } });
    if (existing) return existing;
    try {
      return await tx.customer.create({
        data: { companyId, branchId, code, name: "Walk-in / Cash Sales", status: "ACTIVE", createdById: userId }
      });
    } catch (err: unknown) {
      // Concurrent first sale created it between our findFirst and create.
      if ((err as { code?: string })?.code === "P2002") {
        const row = await tx.customer.findFirst({ where: { companyId, code, deletedAt: null } });
        if (row) return row;
      }
      throw err;
    }
  }

  /**
   * Books the financial side of a cash-and-carry dispatch whose stock has
   * ALREADY been moved by the caller (e.g. FeedProductionService's external
   * feed sale, which runs its own finished-goods decrement). Creates a
   * FULFILLED sales order, a PAID invoice, a settled payment + receipt, and a
   * Finance revenue entry — no accounts-receivable, no FIFO consumption.
   * Runs inside the caller's transaction so the money records commit or roll
   * back together with the stock movement.
   */
  async recordCashSaleForExternalDispatch(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    input: {
      branchId: string;
      warehouseId: string;
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      customerName?: string;
      paymentMethod?: PaymentMethod;
      saleDate?: Date;
      sourceLabel: string;
    }
  ): Promise<{ salesOrderId: string; invoiceId: string; paymentId: string; revenueId: string }> {
    const total = Number((input.quantity * input.unitPrice).toFixed(4));
    const when = input.saleDate ?? new Date();
    const method = input.paymentMethod ?? "CASH";
    const customer = await this.ensureCashCustomerTx(tx, user.companyId, input.branchId, user.id);
    const note = `Cash sale — ${input.sourceLabel}${input.customerName ? ` (${input.customerName})` : ""}`.slice(0, 240);

    const order = await tx.salesOrder.create({
      data: {
        companyId: user.companyId,
        branchId: input.branchId,
        customerId: customer.id,
        warehouseId: input.warehouseId,
        orderNumber: await nextRef(tx, user.companyId, "SO"),
        orderDate: when,
        status: "FULFILLED",
        subtotal: total,
        totalAmount: total,
        paidAmount: total,
        balanceDue: 0,
        salespersonId: user.id,
        stockApprovedById: user.id,
        stockApprovedAt: when,
        notes: note,
        createdById: user.id,
        items: {
          create: [{ companyId: user.companyId, productId: input.productId, quantity: input.quantity, unitPrice: input.unitPrice, discountAmount: 0, lineTotal: total }]
        }
      }
    });
    const invoice = await tx.invoice.create({
      data: {
        companyId: user.companyId,
        branchId: input.branchId,
        customerId: customer.id,
        salesOrderId: order.id,
        invoiceNumber: await nextRef(tx, user.companyId, "INV"),
        invoiceDate: when,
        dueDate: when,
        status: "PAID",
        subtotal: total,
        totalAmount: total,
        paidAmount: total,
        balanceDue: 0,
        createdById: user.id
      }
    });
    const payment = await tx.payment.create({
      data: {
        companyId: user.companyId,
        branchId: input.branchId,
        customerId: customer.id,
        invoiceId: invoice.id,
        paymentNumber: await nextRef(tx, user.companyId, "PAY"),
        paymentDate: when,
        amount: total,
        method,
        status: "POSTED",
        reference: input.sourceLabel.slice(0, 190),
        receivedById: user.id,
        createdById: user.id
      }
    });
    await tx.receipt.create({
      data: {
        companyId: user.companyId,
        branchId: input.branchId,
        customerId: customer.id,
        invoiceId: invoice.id,
        paymentId: payment.id,
        receiptNumber: await nextRef(tx, user.companyId, "RCT"),
        receiptDate: when,
        amount: total,
        issuedById: user.id,
        createdById: user.id
      }
    });
    const revenue = await tx.revenue.create({
      data: {
        companyId: user.companyId,
        reference: await nextRef(tx, user.companyId, "REV"),
        source: "PRODUCT_SALES",
        description: note,
        amount: total,
        revenueDate: when,
        paymentMethod: method as never,
        customerName: input.customerName ?? "Walk-in / Cash Sales",
        invoiceRef: invoice.invoiceNumber,
        branchId: input.branchId,
        createdById: user.id
      }
    });

    return { salesOrderId: order.id, invoiceId: invoice.id, paymentId: payment.id, revenueId: revenue.id };
  }

  private async findPaymentByIdempotencyKey(companyId: string, idempotencyKey: string) {
    const payment = await this.prisma.payment.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
    if (!payment) return null;
    const receipt = await this.prisma.receipt.findFirst({ where: { paymentId: payment.id, deletedAt: null } });
    return { payment, receipt };
  }

  private async findOrderByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.salesOrder.findFirst({
      where: { companyId, idempotencyKey, deletedAt: null },
      include: { items: { include: { product: true } }, customer: true, warehouse: true }
    });
  }

  async listPayments(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.payment.findMany({ where: this.paymentWhere(user, query), include: { customer: true, invoice: true, receipt: true }, orderBy: { paymentDate: "desc" }, take: 200 });
    return { data };
  }

  async listReceipts(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.receipt.findMany({ where: this.receiptWhere(user, query), include: { customer: true, invoice: true, payment: true }, orderBy: { receiptDate: "desc" }, take: 200 });
    return { data };
  }

  async createReturn(user: AuthenticatedUser, dto: CreateSalesReturnDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const [customer, warehouse, product] = await Promise.all([
      this.prisma.customer.findFirst({ where: { companyId: user.companyId, id: dto.customerId, deletedAt: null } }),
      this.prisma.warehouse.findFirst({ where: { companyId: user.companyId, id: dto.warehouseId, deletedAt: null } }),
      this.prisma.product.findFirst({ where: { companyId: user.companyId, id: dto.productId, deletedAt: null } })
    ]);
    if (!customer) throw new NotFoundException("Customer was not found.");
    if (!warehouse) throw new NotFoundException("Warehouse was not found.");
    if (!product) throw new NotFoundException("Product was not found.");

    let quantity = dto.quantity;
    let unitPrice = dto.unitPrice;

    if (dto.salesOrderId) {
      const orderItem = await this.prisma.salesOrderItem.findFirst({
        where: { salesOrderId: dto.salesOrderId, productId: dto.productId, companyId: user.companyId }
      });
      if (!orderItem) throw new BadRequestException("This product was not part of the referenced sales order.");

      const alreadyReturned = await this.prisma.salesReturn.aggregate({
        where: { salesOrderId: dto.salesOrderId, productId: dto.productId, status: "POSTED", deletedAt: null },
        _sum: { quantity: true }
      });
      const remaining = Number(orderItem.quantity) - Number(alreadyReturned._sum.quantity ?? 0);
      if (dto.quantity > remaining) {
        throw new BadRequestException(`Cannot return more than the remaining ${remaining} unit(s) sold on this order.`);
      }
      // Price is derived from the original sale, never trusted from the
      // client — otherwise a return could overcredit the customer at an
      // inflated price it never actually sold for.
      unitPrice = Number(orderItem.unitPrice);
      quantity = dto.quantity;
    } else {
      // H-BACK: a standalone return (no salesOrderId) took the client-
      // supplied unitPrice with no bound at all — any quantity x price a
      // caller specified, for a product that may never have sold at that
      // price. Cap it at the highest price this product has actually ever
      // sold for (or been listed at), so a return can never credit more
      // than the product has legitimately been worth.
      const [maxSold, maxListed] = await Promise.all([
        this.prisma.salesOrderItem.aggregate({ where: { companyId: user.companyId, productId: dto.productId }, _max: { unitPrice: true } }),
        this.prisma.priceList.aggregate({ where: { companyId: user.companyId, productId: dto.productId, deletedAt: null }, _max: { unitPrice: true } })
      ]);
      const maxKnownPrice = Math.max(Number(maxSold._max.unitPrice ?? 0), Number(maxListed._max.unitPrice ?? 0));
      if (maxKnownPrice <= 0) {
        throw new BadRequestException("This product has no recorded sale or price-list entry — link this return to the original sales order instead.");
      }
      if (dto.unitPrice > maxKnownPrice) {
        throw new BadRequestException(`Unit price cannot exceed GHS ${maxKnownPrice.toFixed(2)}, the highest recorded price for this product.`);
      }
    }

    const totalAmount = quantity * unitPrice;

    // A return can no longer request immediate POSTED/APPROVED status at
    // creation — it always starts REQUESTED and must go through
    // approveReturn()/rejectReturn() by a *different* user. Previously
    // status was client-settable and self-approving, meaning any
    // SALES_MANAGE user could fabricate inventory and overcredit a customer
    // with a single unaudited call. See approveReturn() for the actual
    // inventory/credit effects, now gated behind that second-approver step.
    const data = await this.prisma.salesReturn.create({
      data: {
        companyId: user.companyId,
        branchId: customer.branchId,
        customerId: customer.id,
        salesOrderId: dto.salesOrderId,
        productId: product.id,
        warehouseId: warehouse.id,
        quantity,
        unitPrice,
        totalAmount,
        reason: dto.reason,
        status: "REQUESTED",
        createdById: user.id
      }
    });
    await this.writeAudit(user, "CREATE", "SalesReturn", data.id, `Requested sales return for ${product.sku}`, context, { branchId: customer.branchId, warehouseId: warehouse.id });
    return { data };
  }

  async approveReturn(user: AuthenticatedUser, id: string, context: RequestContext) {
    const salesReturn = await this.loadPendingReturn(user, id);

    const quantity = Number(salesReturn.quantity);
    const unitPrice = Number(salesReturn.unitPrice);
    const totalAmount = Number(salesReturn.totalAmount);
    const warehouse = salesReturn.warehouse;
    const product = salesReturn.product;

    const data = await this.prisma.$transaction(async (tx) => {
      // C1 (DB stability audit, 2026-08-16): status was only ever checked by
      // loadPendingReturn's plain findFirst, outside this transaction — two
      // concurrent approvals (two managers, or one double-click) both passed
      // that check and both applied the full stock+credit effect below,
      // duplicating inventory and double-crediting the customer. Claiming the
      // row via a guarded updateMany, first thing inside the transaction, is
      // the same fix already used correctly elsewhere in this codebase
      // (market-planning's approveTarget, procurement's approvePurchaseOrder)
      // — MySQL re-evaluates this WHERE clause against the latest committed
      // row for UPDATE statements, so only one concurrent caller can ever
      // claim REQUESTED -> POSTED.
      const claimed = await tx.salesReturn.updateMany({
        where: { id, status: "REQUESTED" },
        data: { status: "POSTED", approvedById: user.id, approvedAt: new Date() }
      });
      if (claimed.count === 0) {
        throw new BadRequestException("This return has already been processed.");
      }

      const item = await tx.inventoryItem.upsert({
        where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: warehouse.id, productId: product.id } },
        update: { quantityOnHand: { increment: quantity }, updatedById: user.id },
        create: { companyId: user.companyId, branchId: warehouse.branchId, warehouseId: warehouse.id, farmId: warehouse.farmId, productionSiteId: warehouse.productionSiteId, productId: product.id, uomId: product.uomId, quantityOnHand: quantity, createdById: user.id }
      });
      await tx.stockBatch.create({
        data: { companyId: user.companyId, branchId: warehouse.branchId, farmId: warehouse.farmId, warehouseId: warehouse.id, productionSiteId: warehouse.productionSiteId, productId: product.id, inventoryItemId: item.id, uomId: product.uomId, batchNumber: `RET-${salesReturn.id.slice(0, 8).toUpperCase()}`, quantityReceived: quantity, quantityRemaining: quantity, unitCost: unitPrice, createdById: user.id }
      });
      await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, productId: product.id, inventoryItemId: item.id, toWarehouseId: warehouse.id, warehouseId: warehouse.id, farmId: warehouse.farmId, productionSiteId: warehouse.productionSiteId, uomId: product.uomId, movementType: "RETURN_IN", quantity, unitCost: unitPrice, referenceType: "SalesReturn", referenceId: salesReturn.id, notes: salesReturn.reason, createdById: user.id } });
      await this.addCustomerCreditTx(tx, salesReturn.customerId, salesReturn.branchId, salesReturn.id, totalAmount, `Sales return ${product.sku}`, true);

      // H-HIGH (2026-08-12): this credited the customer's overall running
      // balance but never touched the specific invoice for the sale being
      // returned — SalesReturn has no invoiceId, but a return tied to a
      // sales order can still find that order's invoice via salesOrderId.
      // Without this, the invoice keeps showing the full pre-return amount
      // due (someone collecting against invoices, not the debtors summary,
      // would still ask for the full amount), and the dashboard's
      // outstandingDebt figure (summed from Invoice.balanceDue) stays
      // overstated indefinitely. Capped at the invoice's own balance —
      // any excess still lands on the customer's overall credit via
      // addCustomerCreditTx above, same as before.
      if (salesReturn.salesOrderId) {
        const invoice = await tx.invoice.findFirst({ where: { salesOrderId: salesReturn.salesOrderId, companyId: user.companyId, deletedAt: null } });
        if (invoice && Number(invoice.balanceDue) > 0) {
          const reduceBy = Math.min(totalAmount, Number(invoice.balanceDue));
          const invUpdate = await tx.invoice.updateMany({
            where: { id: invoice.id, balanceDue: { gte: reduceBy } },
            data: { balanceDue: { decrement: reduceBy }, updatedById: user.id }
          });
          if (invUpdate.count > 0) {
            const refreshed = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, select: { balanceDue: true } });
            if (Number(refreshed.balanceDue) <= 0) {
              await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
            }
          }
        }
      }

      return tx.salesReturn.findUniqueOrThrow({ where: { id } });
    });

    await this.writeAudit(user, "APPROVE", "SalesReturn", id, `Approved sales return for ${product.sku}`, context, { branchId: salesReturn.branchId, warehouseId: warehouse.id });
    // M-BUG (2026-08-13): a payment mirrors into Finance's Revenue ledger
    // (createSalesRevenue/H21 above), but approving a return never created
    // the reversing entry — Finance's P&L/cash-flow reports built entirely
    // from the Revenue table overstated real revenue by the value of every
    // return, with no automatic way to catch the drift. A negative-amount
    // Revenue row is the standard reversing-entry pattern; the reports
    // already sum this table with a plain aggregate, so it nets out
    // correctly with zero changes needed on the reporting side.
    try {
      await this.createSalesReturnReversal(user, salesReturn, product, totalAmount);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.warn(`Failed to create Finance revenue reversal for sales return ${id} (company ${user.companyId}): ${message}`);
    }
    return { data };
  }

  private async createSalesReturnReversal(user: AuthenticatedUser, salesReturn: { id: string; branchId: string; customer: { name: string } | null }, product: { sku: string }, totalAmount: number) {
    await this.prisma.revenue.create({
      data: {
        companyId: user.companyId,
        branchId: salesReturn.branchId,
        reference: await nextRef(this.prisma, user.companyId, "REV"),
        source: "PRODUCT_SALES",
        description: `Sales return reversal ${product.sku}`.slice(0, 240),
        amount: -totalAmount,
        revenueDate: new Date(),
        paymentMethod: "CREDIT_NOTE",
        customerName: salesReturn.customer?.name,
        createdById: user.id
      }
    });
  }

  async rejectReturn(user: AuthenticatedUser, id: string, context: RequestContext) {
    const salesReturn = await this.loadPendingReturn(user, id);

    // Same guarded-claim fix as approveReturn — prevents a reject racing an
    // approve (or a double-reject) from silently no-op'ing or double-logging.
    const claimed = await this.prisma.salesReturn.updateMany({
      where: { id, status: "REQUESTED" },
      data: { status: "REJECTED", approvedById: user.id, approvedAt: new Date() }
    });
    if (claimed.count === 0) {
      throw new BadRequestException("This return has already been processed.");
    }
    const data = await this.prisma.salesReturn.findUniqueOrThrow({ where: { id } });
    await this.writeAudit(user, "REJECT", "SalesReturn", id, `Rejected sales return for ${salesReturn.product.sku}`, context, { branchId: salesReturn.branchId, warehouseId: salesReturn.warehouseId });
    return { data };
  }

  private async loadPendingReturn(user: AuthenticatedUser, id: string) {
    const salesReturn = await this.prisma.salesReturn.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: { product: true, warehouse: true, customer: { select: { name: true } } }
    });
    if (!salesReturn) throw new NotFoundException("Sales return was not found.");
    // Fast-fail UX check only — the actual race-safe guard is the
    // status-guarded updateMany in approveReturn/rejectReturn below.
    if (salesReturn.status !== "REQUESTED") throw new BadRequestException("Only pending returns can be approved or rejected.");
    if (salesReturn.createdById === user.id) throw new ForbiddenException("You cannot approve or reject your own return request.");
    this.assertWarehouseAccess(user, salesReturn.warehouseId);
    return salesReturn;
  }

  async listReturns(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.salesReturn.findMany({ where: this.returnWhere(user, query), include: { customer: true, product: true, warehouse: true, salesOrder: true }, orderBy: { createdAt: "desc" }, take: 200 });
    return { data };
  }

  async listDeliveryNotes(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.deliveryNote.findMany({ where: this.deliveryWhere(user, query), include: { salesOrder: { include: { customer: true } }, warehouse: true }, orderBy: { deliveryDate: "desc" }, take: 200 });
    return { data };
  }

  async statements(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.customerStatement.findMany({ where: this.statementWhere(user, query), include: { customer: true, invoice: true, payment: true, salesReturn: true }, orderBy: { entryDate: "desc" }, take: 200 });
    return { data };
  }

  async debtors(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.customerCreditLimit.findMany({
      where: { companyId: user.companyId, deletedAt: null, currentBalance: { gt: 0 }, customerId: query.customerId || undefined, ...(user.hasGlobalAccess ? (query.branchId ? { branchId: query.branchId } : {}) : user.branchIds.length > 0 ? { branchId: { in: user.branchIds } } : {}) },
      include: { customer: true, branch: true },
      orderBy: { currentBalance: "desc" },
      take: 200
    });
    return { data };
  }

  async reports(user: AuthenticatedUser, query: SalesQueryDto) {
    const [byProduct, byCustomer, byLocation, salesperson] = await Promise.all([
      this.salesByProduct(user, query),
      this.salesByCustomer(user, query),
      this.salesByLocation(user, query),
      this.salespersonPerformance(user, query)
    ]);

    return { data: { byProduct, byCustomer, byLocation, salesperson } };
  }

  async reportCsv(user: AuthenticatedUser, query: SalesQueryDto, context: RequestContext) {
    const rows = await this.salesByProduct(user, query);
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "EXPORT", entityType: "Report", entityId: "sales.summary", summary: "Exported sales summary report", ipAddress: context.ipAddress, userAgent: context.userAgent });
    return [["sku", "product", "quantity", "sales_value"], ...rows.map((row) => [row.sku, row.product, String(row.quantity), String(row.salesValue)])].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  // (M7) These four report breakdowns previously fetched only the 200 most-recent
  // matching orders and aggregated in JS — over that threshold, older orders (and
  // any product/customer/location/salesperson whose activity lived only in them)
  // silently vanished from "top" rankings with no indication to the user. Grouping
  // in the DB removes the cap entirely: it aggregates over every matching row.
  private async salesByProduct(user: AuthenticatedUser, query: SalesQueryDto) {
    const groups = await this.prisma.salesOrderItem.groupBy({
      by: ["productId"],
      where: { companyId: user.companyId, salesOrder: this.orderWhere(user, query) },
      _sum: { quantity: true, lineTotal: true }
    });
    if (groups.length === 0) return [];
    const products = await this.prisma.product.findMany({ where: { id: { in: groups.map((g) => g.productId) } }, select: { id: true, sku: true, name: true } });
    const productById = new Map(products.map((p) => [p.id, p]));
    return groups
      .map((g) => {
        const product = productById.get(g.productId);
        return { sku: product?.sku ?? "—", product: product?.name ?? "Unknown product", quantity: Number(g._sum.quantity ?? 0), salesValue: Number(g._sum.lineTotal ?? 0) };
      })
      .sort((a, b) => b.salesValue - a.salesValue);
  }

  private async salesByCustomer(user: AuthenticatedUser, query: SalesQueryDto) {
    const groups = await this.prisma.salesOrder.groupBy({
      by: ["customerId"],
      where: this.orderWhere(user, query),
      _count: { _all: true },
      _sum: { totalAmount: true, balanceDue: true }
    });
    if (groups.length === 0) return [];
    const customers = await this.prisma.customer.findMany({ where: { id: { in: groups.map((g) => g.customerId) } }, select: { id: true, code: true, name: true } });
    const customerById = new Map(customers.map((c) => [c.id, c]));
    return groups
      .map((g) => {
        const customer = customerById.get(g.customerId);
        return { code: customer?.code ?? "—", customer: customer?.name ?? "Unknown customer", orders: g._count._all, salesValue: Number(g._sum.totalAmount ?? 0), balanceDue: Number(g._sum.balanceDue ?? 0) };
      })
      .sort((a, b) => b.salesValue - a.salesValue);
  }

  private async salesByLocation(user: AuthenticatedUser, query: SalesQueryDto) {
    const groups = await this.prisma.salesOrder.groupBy({
      by: ["branchId", "warehouseId"],
      where: this.orderWhere(user, query),
      _count: { _all: true },
      _sum: { totalAmount: true }
    });
    if (groups.length === 0) return [];
    const [branches, warehouses] = await Promise.all([
      this.prisma.branch.findMany({ where: { id: { in: [...new Set(groups.map((g) => g.branchId))] } }, select: { id: true, name: true } }),
      this.prisma.warehouse.findMany({ where: { id: { in: [...new Set(groups.map((g) => g.warehouseId))] } }, select: { id: true, name: true } })
    ]);
    const branchById = new Map(branches.map((b) => [b.id, b]));
    const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
    return groups
      .map((g) => ({
        branch: branchById.get(g.branchId)?.name ?? "Unknown branch",
        warehouse: warehouseById.get(g.warehouseId)?.name ?? "Unknown warehouse",
        orders: g._count._all,
        salesValue: Number(g._sum.totalAmount ?? 0)
      }))
      .sort((a, b) => b.salesValue - a.salesValue);
  }

  private async salespersonPerformance(user: AuthenticatedUser, query: SalesQueryDto) {
    const groups = await this.prisma.salesOrder.groupBy({
      by: ["salespersonId"],
      where: this.orderWhere(user, query),
      _count: { _all: true },
      _sum: { totalAmount: true, balanceDue: true }
    });
    return groups
      .map((g) => ({
        salespersonId: g.salespersonId ?? "unassigned",
        orders: g._count._all,
        salesValue: Number(g._sum.totalAmount ?? 0),
        collectionsOutstanding: Number(g._sum.balanceDue ?? 0)
      }))
      .sort((a, b) => b.salesValue - a.salesValue);
  }

  private async autoGenerateProductionOrders(
    companyId: string,
    branchId: string,
    salesOrderNumber: string,
    salesOrderId: string,
    items: CreateSalesOrderItemDto[],
    createdById: string
  ) {
    for (const item of items) {
      // Find an active formula whose finished product matches this sales item
      const formula = await this.prisma.feedFormula.findFirst({
        where: { companyId, finishedProductId: item.productId, status: "ACTIVE", deletedAt: null },
        select: { id: true, branchId: true, finishedProductId: true, targetBatchKg: true }
      });
      if (!formula) continue; // not a feed product — skip

      // Find a feed production site in the same branch as the formula
      const site = await this.prisma.productionSite.findFirst({
        where: { companyId, branchId: formula.branchId, type: { in: ["FEED_PRODUCTION", "MIXED"] }, deletedAt: null },
        select: { id: true, branchId: true }
      });
      if (!site) continue; // no production site available — skip

      // Convert quantity to kg: assume each unit = 50 kg bag unless UOM says otherwise
      const product = await this.prisma.product.findFirst({
        where: { id: item.productId },
        select: { uom: { select: { symbol: true, name: true } } }
      });
      const uomName = (product?.uom?.name ?? "").toLowerCase();
      const uomSymbol = (product?.uom?.symbol ?? "").toLowerCase();
      const kgFactor = uomName.includes("50") || uomSymbol.includes("bag") ? 50 : 1;
      const plannedQuantityKg = item.quantity * kgFactor;

      // count+1 raced under concurrent sales orders (two requests reading the
      // same count before either insert lands) and produced a different
      // orderNumber format than feed-production.service.ts's own manual
      // creation path besides. nextRef is the same atomic-allocation helper
      // that path already uses.
      const orderNumber = await nextRef(this.prisma, companyId, "FPO");

      await this.prisma.feedProductionOrder.create({
        data: {
          companyId,
          branchId: site.branchId,
          productionSiteId: site.id,
          formulaId: formula.id,
          finishedProductId: formula.finishedProductId,
          orderNumber,
          plannedQuantityKg,
          scheduledDate: new Date(),
          status: "DRAFT",
          notes: `Auto-generated from sales order ${salesOrderNumber} (${salesOrderId})`,
          createdById
        }
      });
    }
  }

  private async fireStockShortageAlerts(
    companyId: string,
    branchId: string,
    orderNumber: string,
    shortItems: { item: { productId: string; quantity: number }; available: number }[]
  ) {
    const productIds = shortItems.map((s) => s.item.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sku: true } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const lines = shortItems.map(({ item, available }) => {
      const p = productMap.get(item.productId);
      const label = p ? `${p.name} (${p.sku})` : item.productId;
      const shortBy = item.quantity - available;
      return `${label}: ordered ${item.quantity}, in stock ${available}, short by ${shortBy}`;
    });
    const detail = lines.join(" | ");

    await Promise.all([
      this.prisma.dashboardAlert.create({
        data: {
          companyId,
          branchId,
          businessUnit: "FEED_MILL",
          title: `Production Required — Sales Order ${orderNumber}`,
          message: `Sales order ${orderNumber} cannot be fulfilled from current stock. Production team: please schedule production for the following items. ${detail}`,
          severity: "WARNING",
        },
      }),
      this.prisma.dashboardAlert.create({
        data: {
          companyId,
          branchId,
          businessUnit: "PROCUREMENT",
          title: `Procurement Alert — Sales Order ${orderNumber}`,
          message: `Sales order ${orderNumber} has insufficient stock. If production cannot cover these items, please raise purchase orders for raw materials or finished goods. ${detail}`,
          severity: "WARNING",
        },
      }),
    ]);
  }

  private async availableStock(companyId: string, warehouseId: string, productId: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { companyId, warehouseId, productId, deletedAt: null }, select: { quantityOnHand: true } });
    return Number(item?.quantityOnHand ?? 0);
  }

  private async assertCreditLimit(customerId: string, amount: number) {
    const credit = await this.prisma.customerCreditLimit.findFirst({ where: { customerId, deletedAt: null } });
    if (credit && Number(credit.creditLimit) > 0 && Number(credit.currentBalance) + amount > Number(credit.creditLimit)) {
      throw new BadRequestException("Sales order exceeds customer credit limit.");
    }
  }

  // H-BUG-1 (2026-08-12, from the inventory-integration logic audit): this was
  // the one place in the whole codebase that took stock via a plain `update`
  // instead of a floor-guarded `updateMany` — every sibling module's FIFO
  // consumer (feed-production, market-planning, soya-processing, poultry,
  // maintenance) re-checks "is there still actually enough left" at the exact
  // moment it decrements, so two concurrent consumers of the same lot can't
  // both succeed. This one only checked `available < quantity` once, up
  // front, then trusted that snapshot for the rest of the loop — two sales
  // orders releasing the last units of the same product within the same
  // transaction window could both pass that check and both "succeed",
  // driving quantityRemaining/quantityOnHand negative. Now matches the
  // guarded pattern every other module already uses.
  private async consumeFifoTx(tx: Prisma.TransactionClient, user: AuthenticatedUser, item: InventoryItemContext, quantity: number, referenceType: string, referenceId: string, notes?: string) {
    let remaining = quantity;
    // H-BUG-2: status: "AVAILABLE" excludes lots Quality has rejected or
    // quarantined — see quality.service.ts's approve/reject/quarantineBatch.
    const batches = await tx.stockBatch.findMany({ where: { companyId: user.companyId, inventoryItemId: item.id, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null }, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }] });
    const available = batches.reduce((sum, batch) => sum + Number(batch.quantityRemaining), 0);
    if (available < quantity || Number(item.quantityOnHand) < quantity) throw new BadRequestException("Insufficient stock to release this sale.");
    for (const batch of batches) {
      if (remaining <= 0) break;
      const issue = Math.min(remaining, Number(batch.quantityRemaining));
      const batchUpdate = await tx.stockBatch.updateMany({
        where: { id: batch.id, quantityRemaining: { gte: issue } },
        data: { quantityRemaining: { decrement: issue } }
      });
      if (batchUpdate.count === 0) {
        throw new BadRequestException("Stock batch was consumed concurrently by another sale. Please retry.");
      }
      // Separate, self-contained status flip: re-reads the batch's current
      // quantityRemaining via the where clause rather than trusting the
      // pre-loop snapshot, so it's correct regardless of what else touched
      // this batch concurrently.
      await tx.stockBatch.updateMany({ where: { id: batch.id, quantityRemaining: 0 }, data: { status: "CONSUMED" } });
      await tx.stockMovement.create({
        data: {
          companyId: user.companyId,
          branchId: item.branchId,
          productId: item.productId,
          inventoryItemId: item.id,
          stockBatchId: batch.id,
          fromWarehouseId: item.warehouseId,
          warehouseId: item.warehouseId,
          farmId: item.farmId,
          productionSiteId: item.productionSiteId,
          uomId: item.uomId,
          movementType: "SALE_DISPATCH",
          quantity: issue,
          unitCost: batch.unitCost,
          referenceType,
          referenceId,
          notes,
          createdById: user.id
        }
      });
      remaining -= issue;
    }
    if (remaining > 0) {
      throw new BadRequestException("Stock batches on hand cover less than the required quantity — inventory and lot records are out of sync. Please investigate before retrying.");
    }
    const itemUpdate = await tx.inventoryItem.updateMany({
      where: { id: item.id, quantityOnHand: { gte: quantity } },
      data: { quantityOnHand: { decrement: quantity }, updatedById: user.id }
    });
    if (itemUpdate.count === 0) {
      throw new BadRequestException("Insufficient stock — possibly consumed concurrently. Please retry.");
    }
  }

  private async addCustomerDebitTx(tx: Prisma.TransactionClient, customerId: string, branchId: string, invoiceId: string, amount: number, description: string) {
    const credit = await this.ensureCreditLimitTx(tx, customerId, branchId);
    // H6: atomic increment instead of a read-then-write in JS — two
    // concurrent debits for the same customer (e.g. two orders approved for
    // release within the same second) could otherwise both read the same
    // currentBalance and each silently overwrite the other's effect on it.
    const updated = await tx.customerCreditLimit.update({ where: { id: credit.id }, data: { currentBalance: { increment: amount } } });
    // H7: credit-limit enforcement previously only ran once, at order
    // creation (assertCreditLimit) — a snapshot check long before any money
    // was actually owed. A rep could create many orders in parallel that
    // each individually passed the check against a still-unchanged balance,
    // then blow past the limit once several got approved for release. This
    // re-check runs at the point the debt is actually incurred, inside the
    // same transaction as the atomic increment above (so it can't be raced
    // the same way), and rolls back the whole fulfillment if it fails.
    if (Number(credit.creditLimit) > 0 && Number(updated.currentBalance) > Number(credit.creditLimit)) {
      throw new BadRequestException(`Releasing this order would put the customer's balance at ${Number(updated.currentBalance).toFixed(2)}, over their credit limit of ${Number(credit.creditLimit).toFixed(2)}.`);
    }
    const balance = Number(updated.currentBalance);
    await tx.customerStatement.create({ data: { companyId: credit.companyId, branchId, customerId, invoiceId, entryType: "INVOICE", debit: amount, credit: 0, balance, description } });
  }

  private async addCustomerCreditTx(tx: Prisma.TransactionClient, customerId: string, branchId: string, referenceId: string, amount: number, description: string, isReturn = false) {
    const credit = await this.ensureCreditLimitTx(tx, customerId, branchId);
    // H6: atomic decrement via raw SQL rather than a plain read-then-write
    // in JS, which let two concurrent credits for the same customer (e.g. a
    // payment and a return recorded together) both read the same
    // currentBalance and each silently overwrite the other's effect on it.
    //
    // M-BUG (2026-08-13): payments floor at zero — you can't owe a negative
    // amount by paying down a bill, and any genuine overpayment is a
    // separate concern from this function. Returns are different: a return
    // worth more than the customer currently owes means the business now
    // owes THEM a refund, and flooring that at zero made the excess simply
    // vanish — the system showed "balance: zero, all clear" while actually
    // owing the customer money. Returns are allowed to drive the balance
    // negative; the debtors report already filters on currentBalance > 0,
    // so a negative (we-owe-them) balance correctly stops showing up there.
    if (isReturn) {
      await tx.$executeRaw`UPDATE CustomerCreditLimit SET currentBalance = currentBalance - ${amount} WHERE id = ${credit.id}`;
    } else {
      await tx.$executeRaw`UPDATE CustomerCreditLimit SET currentBalance = GREATEST(0, currentBalance - ${amount}) WHERE id = ${credit.id}`;
    }
    const updated = await tx.customerCreditLimit.findUniqueOrThrow({ where: { id: credit.id } });
    const balance = Number(updated.currentBalance);
    await tx.customerStatement.create({ data: { companyId: credit.companyId, branchId, customerId, paymentId: isReturn ? undefined : referenceId, salesReturnId: isReturn ? referenceId : undefined, entryType: isReturn ? "RETURN" : "PAYMENT", debit: 0, credit: amount, balance, description } });
  }

  private async ensureCreditLimitTx(tx: Prisma.TransactionClient, customerId: string, branchId: string) {
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
    return tx.customerCreditLimit.upsert({
      where: { companyId_customerId: { companyId: customer.companyId, customerId } },
      update: {},
      create: { companyId: customer.companyId, branchId, customerId, creditLimit: 0, currentBalance: 0 }
    });
  }

  private lineTotal(item: CreateSalesOrderItemDto) {
    return item.quantity * item.unitPrice - (item.discountAmount ?? 0);
  }

  private sum<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
    return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  }

  private dateRange(query: SalesQueryDto, field: "orderDate" | "invoiceDate" | "paymentDate" | "receiptDate" | "entryDate" | "deliveryDate") {
    return query.startDate || query.endDate ? { [field]: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } } : {};
  }

  private customerGroupWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    const branchScope = !user.hasGlobalAccess && user.branchIds.length > 0
      ? { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] }
      : {};
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId || undefined, ...branchScope };
  }

  // Combines a caller-supplied branchId filter with the user's branch restriction.
  // Plain spread would overwrite one with the other; AND applies both simultaneously.
  // Empty branchIds means "no assigned branches" → fall through to company-level visibility.
  private branchScope(user: AuthenticatedUser, query: SalesQueryDto) {
    const conditions: object[] = [];
    if (query.branchId) conditions.push({ branchId: query.branchId });
    if (!user.hasGlobalAccess && user.branchIds.length > 0) conditions.push({ branchId: { in: user.branchIds } });
    return conditions.length ? { AND: conditions } : {};
  }

  private customerWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, id: query.customerId, ...this.branchScope(user, query) };
  }

  private priceListWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    const andConditions: object[] = [];
    if (query.branchId) andConditions.push({ branchId: query.branchId });
    if (!user.hasGlobalAccess && user.branchIds.length > 0) andConditions.push({ OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] });
    return { companyId: user.companyId, deletedAt: null, productId: query.productId || undefined, ...(andConditions.length ? { AND: andConditions } : {}) };
  }

  private orderWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, customerId: query.customerId, warehouseId: query.warehouseId, ...(this.dateRange(query, "orderDate")), ...this.branchScope(user, query) };
  }

  private invoiceWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, customerId: query.customerId, ...(this.dateRange(query, "invoiceDate")), ...this.branchScope(user, query) };
  }

  private paymentWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, customerId: query.customerId, ...(this.dateRange(query, "paymentDate")), ...this.branchScope(user, query) };
  }

  private receiptWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, customerId: query.customerId, ...(this.dateRange(query, "receiptDate")), ...this.branchScope(user, query) };
  }

  private returnWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, customerId: query.customerId, productId: query.productId, warehouseId: query.warehouseId, ...this.branchScope(user, query) };
  }

  private deliveryWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, warehouseId: query.warehouseId, ...(this.dateRange(query, "deliveryDate")), ...this.branchScope(user, query) };
  }

  private statementWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, customerId: query.customerId, ...(this.dateRange(query, "entryDate")), ...this.branchScope(user, query) };
  }

  // (2026-08-26) Missing the "empty array means unrestricted" check used
  // elsewhere in this codebase — a user with no explicit branch/warehouse
  // restrictions (the normal, common case) was blocked from every
  // branch/warehouse-scoped write, since an empty array can never
  // .includes() anything.
  private assertBranchAccess(user: AuthenticatedUser, branchId: string) {
    if (!user.hasGlobalAccess && user.branchIds.length > 0 && !user.branchIds.includes(branchId)) throw new ForbiddenException("You do not have access to this branch.");
  }

  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && user.warehouseIds.length > 0 && !user.warehouseIds.includes(warehouseId)) throw new ForbiddenException("You do not have access to this warehouse.");
  }

  private daysFromNow(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT", entityType: string, entityId: string, summary: string, context: RequestContext, scope: Scope) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType, entityId, summary, branchId: scope.branchId, warehouseId: scope.warehouseId, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }

  // ── Prospect Visits ──────────────────────────────────────────────────────

  async logProspectVisit(user: AuthenticatedUser, dto: CreateProspectVisitDto, ctx: RequestContext) {
    // Mobile parity audit (2026-08-17): mirrors createOrder/createPayment's
    // idempotencyKey handling above — a mobile offline-queue resend (or a
    // client retry after a dropped response) carrying the same
    // idempotencyKey replays the original visit instead of creating a
    // second one.
    if (dto.idempotencyKey) {
      const existing = await this.findProspectVisitByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    let visit;
    try {
      visit = await this.prisma.prospectVisit.create({
        data: {
          companyId:    user.companyId,
          branchId:     dto.branchId,
          repId:        user.id,
          prospectName: dto.prospectName,
          phone:        dto.phone,
          address:      dto.address,
          latitude:     dto.latitude,
          longitude:    dto.longitude,
          visitType:    dto.visitType ?? "COLD_CALL",
          outcome:      dto.outcome   ?? "INTERESTED",
          notes:        dto.notes,
          visitedAt:    dto.visitedAt ? new Date(dto.visitedAt) : new Date(),
          idempotencyKey: dto.idempotencyKey,
        } as never,
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findProspectVisitByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "ProspectVisit", entityId: visit.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { data: visit };
  }

  private async findProspectVisitByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.prospectVisit.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } as never });
  }

  async listProspectVisits(user: AuthenticatedUser, query: ProspectVisitQueryDto) {
    const cid = user.companyId;
    const page  = Math.max(1, Number(query.page  ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));
    const where: Record<string, unknown> = { companyId: cid, deletedAt: null };
    if (query.repId)   where.repId    = query.repId;
    if (query.branchId) where.branchId = query.branchId;
    if (query.outcome) where.outcome  = query.outcome;
    if (query.dateFrom || query.dateTo) {
      where.visitedAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo   ? { lte: new Date(query.dateTo)   } : {}),
      };
    }
    const [total, visits] = await Promise.all([
      (this.prisma.prospectVisit as any).count({ where }).catch(() => 0),
      (this.prisma.prospectVisit as any).findMany({
        where,
        orderBy: { visitedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { company: { select: { name: true } } },
      }).catch(() => [] as any[]),
    ]);
    return { data: visits, meta: { total, page, limit } };
  }

  async myProspectVisits(user: AuthenticatedUser, query: ProspectVisitQueryDto) {
    return this.listProspectVisits(user, { ...query, repId: user.id });
  }
}
