import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { nextRef } from "../../common/next-ref";
import {
  CreateCustomerDto,
  CreateCustomerGroupDto,
  CreatePaymentDto,
  CreatePriceListDto,
  CreateProspectVisitDto,
  CreateSalesOrderDto,
  CreateSalesOrderItemDto,
  CreateSalesReturnDto,
  ProspectVisitQueryDto,
  SalesQueryDto,
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
    const [orders, invoiceAgg, paymentAgg, returnAgg, topProducts, topCustomers] = await Promise.all([
      this.prisma.salesOrder.findMany({ where, include: { customer: true, warehouse: true }, orderBy: { orderDate: "desc" }, take: 12 }),
      this.prisma.invoice.aggregate({ where: this.invoiceWhere(user, query), _sum: { totalAmount: true, balanceDue: true } }),
      this.prisma.payment.aggregate({ where: this.paymentWhere(user, query), _sum: { amount: true } }),
      this.prisma.salesReturn.aggregate({ where: this.returnWhere(user, query), _sum: { totalAmount: true } }),
      this.salesByProduct(user, query),
      this.salesByCustomer(user, query)
    ]);

    return {
      data: {
        salesValue: Number(invoiceAgg._sum.totalAmount ?? 0),
        paidValue: Number(paymentAgg._sum.amount ?? 0),
        outstandingDebt: Number(invoiceAgg._sum.balanceDue ?? 0),
        returnValue: Number(returnAgg._sum.totalAmount ?? 0),
        pendingStockApprovals: orders.filter((order) => order.status === "PENDING_STOCK_APPROVAL").length,
        fulfilledOrders: orders.filter((order) => order.status === "FULFILLED").length,
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
      this.prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE" }, select: { id: true, sku: true, name: true, uomId: true }, orderBy: { name: "asc" } }),
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
    const data = await this.prisma.customerGroup.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
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

    const data = await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
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
    const [customer, warehouse] = await Promise.all([
      this.prisma.customer.findFirst({ where: { companyId: user.companyId, id: dto.customerId, deletedAt: null } }),
      this.prisma.warehouse.findFirst({ where: { companyId: user.companyId, id: dto.warehouseId, deletedAt: null } })
    ]);
    if (!customer) throw new NotFoundException("Customer was not found.");
    if (customer.status !== "ACTIVE") throw new BadRequestException("Inactive or on-hold customers cannot place new orders.");
    if (!warehouse) throw new NotFoundException("Warehouse was not found.");
    if (warehouse.branchId !== customer.branchId) throw new BadRequestException("Sales warehouse must belong to the customer's branch.");
    this.assertBranchAccess(user, customer.branchId);

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
    const data = await this.prisma.salesOrder.create({
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
        createdById: user.id,
        items: {
          create: dto.items.map((item) => ({ companyId: user.companyId, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount ?? 0, lineTotal: this.lineTotal(item) }))
        }
      },
      include: { items: { include: { product: true } }, customer: true, warehouse: true }
    });
    await this.writeAudit(user, "CREATE", "SalesOrder", data.id, `Created sales order ${orderNumber}`, context, { branchId: customer.branchId, warehouseId: warehouse.id });

    // Fire production + procurement alerts for any short items (non-blocking)
    if (shortItems.length > 0) {
      void this.fireStockShortageAlerts(user.companyId, customer.branchId, orderNumber, shortItems).catch(() => undefined);
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

  async approveStockRelease(user: AuthenticatedUser, id: string, context: RequestContext) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { companyId: user.companyId, id, deletedAt: null },
      include: { items: true, customer: true, warehouse: true, invoices: true }
    });
    if (!order) throw new NotFoundException("Sales order was not found.");
    this.assertWarehouseAccess(user, order.warehouseId);
    if (!["PENDING_STOCK_APPROVAL", "APPROVED"].includes(order.status)) throw new BadRequestException("Only pending sales orders can be released.");

    const data = await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const inventoryItem = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: order.warehouseId, productId: item.productId, deletedAt: null } });
        if (!inventoryItem) throw new BadRequestException("Inventory item was not found for one or more sales order items.");
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
    });

    await this.writeAudit(user, "APPROVE", "SalesOrder", order.id, `Approved stock release for ${order.orderNumber}`, context, { branchId: order.branchId, warehouseId: order.warehouseId });
    return { data };
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

  private async findPaymentByIdempotencyKey(companyId: string, idempotencyKey: string) {
    const payment = await this.prisma.payment.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
    if (!payment) return null;
    const receipt = await this.prisma.receipt.findFirst({ where: { paymentId: payment.id, deletedAt: null } });
    return { payment, receipt };
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

      return tx.salesReturn.update({ where: { id }, data: { status: "POSTED", approvedById: user.id, approvedAt: new Date() } });
    });

    await this.writeAudit(user, "APPROVE", "SalesReturn", id, `Approved sales return for ${product.sku}`, context, { branchId: salesReturn.branchId, warehouseId: warehouse.id });
    return { data };
  }

  async rejectReturn(user: AuthenticatedUser, id: string, context: RequestContext) {
    const salesReturn = await this.loadPendingReturn(user, id);

    const data = await this.prisma.salesReturn.update({
      where: { id },
      data: { status: "REJECTED", approvedById: user.id, approvedAt: new Date() }
    });
    await this.writeAudit(user, "REJECT", "SalesReturn", id, `Rejected sales return for ${salesReturn.product.sku}`, context, { branchId: salesReturn.branchId, warehouseId: salesReturn.warehouseId });
    return { data };
  }

  private async loadPendingReturn(user: AuthenticatedUser, id: string) {
    const salesReturn = await this.prisma.salesReturn.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: { product: true, warehouse: true }
    });
    if (!salesReturn) throw new NotFoundException("Sales return was not found.");
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
    // H6: atomic, clamped-at-zero decrement via raw SQL. Prisma's
    // `decrement` has no floor, and a plain read-then-write in JS let two
    // concurrent credits for the same customer (e.g. a payment and a return
    // recorded together) both read the same currentBalance and each
    // silently overwrite the other's effect on it.
    await tx.$executeRaw`UPDATE CustomerCreditLimit SET currentBalance = GREATEST(0, currentBalance - ${amount}) WHERE id = ${credit.id}`;
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

  private assertBranchAccess(user: AuthenticatedUser, branchId: string) {
    if (!user.hasGlobalAccess && !user.branchIds.includes(branchId)) throw new ForbiddenException("You do not have access to this branch.");
  }

  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && !user.warehouseIds.includes(warehouseId)) throw new ForbiddenException("You do not have access to this warehouse.");
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
    const visit = await this.prisma.prospectVisit.create({
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
      } as never,
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "ProspectVisit", entityId: visit.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { data: visit };
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
