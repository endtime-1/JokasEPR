import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma, SalesReturnStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateCustomerDto,
  CreateCustomerGroupDto,
  CreatePaymentDto,
  CreatePriceListDto,
  CreateSalesOrderDto,
  CreateSalesOrderItemDto,
  CreateSalesReturnDto,
  SalesQueryDto
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async dashboard(user: AuthenticatedUser, query: SalesQueryDto) {
    const where = this.orderWhere(user, query);
    const [orders, invoices, payments, returns, topProducts, topCustomers] = await Promise.all([
      this.prisma.salesOrder.findMany({ where, include: { customer: true, warehouse: true }, orderBy: { orderDate: "desc" }, take: 12 }),
      this.prisma.invoice.findMany({ where: this.invoiceWhere(user, query), select: { totalAmount: true, paidAmount: true, balanceDue: true, status: true } }),
      this.prisma.payment.findMany({ where: this.paymentWhere(user, query), select: { amount: true } }),
      this.prisma.salesReturn.findMany({ where: this.returnWhere(user, query), select: { totalAmount: true } }),
      this.salesByProduct(user, query),
      this.salesByCustomer(user, query)
    ]);

    return {
      data: {
        salesValue: this.sum(invoices, "totalAmount"),
        paidValue: this.sum(payments, "amount"),
        outstandingDebt: this.sum(invoices, "balanceDue"),
        returnValue: this.sum(returns, "totalAmount"),
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
      this.prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.branchIds } }) }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.warehouse.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.warehouseIds.length === 0 ? {} : { id: { in: user.warehouseIds } }) }, select: { id: true, branchId: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE" }, select: { id: true, sku: true, name: true, uomId: true }, orderBy: { name: "asc" } }),
      this.prisma.customerGroup.findMany({ where: this.customerGroupWhere(user, {}), select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.customer.findMany({ where: this.customerWhere(user, {}), select: { id: true, code: true, name: true, customerGroupId: true }, orderBy: { name: "asc" } }),
      this.prisma.priceList.findMany({ where: this.priceListWhere(user, {}), include: { product: { select: { sku: true, name: true } }, customerGroup: { select: { code: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.invoice.findMany({ where: { ...this.invoiceWhere(user, {}), status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }, select: { id: true, invoiceNumber: true, customerId: true, balanceDue: true }, orderBy: { invoiceDate: "desc" } })
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

  async listCustomers(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.customer.findMany({
      where: this.customerWhere(user, query),
      include: { branch: true, customerGroup: true, creditLimits: { where: { deletedAt: null } } },
      orderBy: { createdAt: "desc" }
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

  async listPriceLists(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.priceList.findMany({ where: this.priceListWhere(user, query), include: { product: true, branch: true, customerGroup: true }, orderBy: { createdAt: "desc" } });
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

  async listOrders(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.salesOrder.findMany({
      where: this.orderWhere(user, query),
      include: { customer: true, warehouse: true, items: { include: { product: true } }, invoices: true, deliveryNotes: true },
      orderBy: { orderDate: "desc" }
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

    const stockChecks = await Promise.all(dto.items.map((item) => this.availableStock(user.companyId, dto.warehouseId, item.productId)));
    dto.items.forEach((item, index) => {
      if (stockChecks[index] < item.quantity) {
        throw new BadRequestException(`Insufficient stock for order item ${index + 1}. Available quantity is ${stockChecks[index]}.`);
      }
    });

    const subtotal = dto.items.reduce((sum, item) => sum + this.lineTotal(item), 0);
    const discountAmount = dto.discountAmount ?? 0;
    const taxAmount = dto.taxAmount ?? 0;
    const totalAmount = subtotal - discountAmount + taxAmount;
    if (totalAmount < 0) throw new BadRequestException("Sales order total cannot be negative.");

    await this.assertCreditLimit(customer.id, totalAmount);
    const orderNumber = await this.nextDocumentNumber(user.companyId, "SO", this.prisma.salesOrder);
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
          invoiceNumber: await this.nextDocumentNumber(user.companyId, "INV", tx.invoice),
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
          deliveryNumber: await this.nextDocumentNumber(user.companyId, "DN", tx.deliveryNote),
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
    const data = await this.prisma.invoice.findMany({ where: this.invoiceWhere(user, query), include: { customer: true, salesOrder: true, payments: true }, orderBy: { invoiceDate: "desc" } });
    return { data };
  }

  async createPayment(user: AuthenticatedUser, dto: CreatePaymentDto, context: RequestContext) {
    const customer = await this.prisma.customer.findFirst({ where: { companyId: user.companyId, id: dto.customerId, deletedAt: null } });
    if (!customer) throw new NotFoundException("Customer was not found.");
    this.assertBranchAccess(user, customer.branchId);
    const invoice = dto.invoiceId ? await this.prisma.invoice.findFirst({ where: { companyId: user.companyId, id: dto.invoiceId, customerId: customer.id, deletedAt: null } }) : null;
    if (dto.invoiceId && !invoice) throw new NotFoundException("Invoice was not found.");
    if (invoice && Number(invoice.balanceDue) <= 0) throw new BadRequestException("Invoice has no outstanding balance.");
    if (invoice && dto.amount > Number(invoice.balanceDue)) throw new BadRequestException("Payment amount cannot exceed invoice balance.");

    const data = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          companyId: user.companyId,
          branchId: customer.branchId,
          customerId: customer.id,
          invoiceId: invoice?.id,
          paymentNumber: await this.nextDocumentNumber(user.companyId, "PAY", tx.payment),
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          receivedById: user.id,
          createdById: user.id
        }
      });
      if (invoice) {
        const paidAmount = Number(invoice.paidAmount) + dto.amount;
        const balanceDue = Number(invoice.balanceDue) - dto.amount;
        await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount, balanceDue, status: balanceDue <= 0 ? "PAID" : "PARTIALLY_PAID", updatedById: user.id } });
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
          receiptNumber: await this.nextDocumentNumber(user.companyId, "RCT", tx.receipt),
          receiptDate: new Date(),
          amount: dto.amount,
          issuedById: user.id,
          createdById: user.id
        }
      });
      return { payment, receipt };
    });
    await this.writeAudit(user, "CREATE", "Payment", data.payment.id, `Recorded payment ${data.payment.paymentNumber}`, context, { branchId: customer.branchId });
    return { data };
  }

  async listPayments(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.payment.findMany({ where: this.paymentWhere(user, query), include: { customer: true, invoice: true, receipt: true }, orderBy: { paymentDate: "desc" } });
    return { data };
  }

  async listReceipts(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.receipt.findMany({ where: this.receiptWhere(user, query), include: { customer: true, invoice: true, payment: true }, orderBy: { receiptDate: "desc" } });
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
    const totalAmount = dto.quantity * dto.unitPrice;
    const targetStatus: SalesReturnStatus = dto.status ?? "POSTED";
    const data = await this.prisma.$transaction(async (tx) => {
      const salesReturn = await tx.salesReturn.create({
        data: {
          companyId: user.companyId,
          branchId: customer.branchId,
          customerId: customer.id,
          salesOrderId: dto.salesOrderId,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          totalAmount,
          reason: dto.reason,
          status: targetStatus,
          approvedById: targetStatus === "POSTED" || targetStatus === "APPROVED" ? user.id : undefined,
          approvedAt: targetStatus === "POSTED" || targetStatus === "APPROVED" ? new Date() : undefined,
          createdById: user.id
        }
      });
      if (targetStatus === "POSTED") {
        const item = await tx.inventoryItem.upsert({
          where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId: warehouse.id, productId: product.id } },
          update: { quantityOnHand: { increment: dto.quantity }, updatedById: user.id },
          create: { companyId: user.companyId, branchId: warehouse.branchId, warehouseId: warehouse.id, farmId: warehouse.farmId, productionSiteId: warehouse.productionSiteId, productId: product.id, uomId: product.uomId, quantityOnHand: dto.quantity, createdById: user.id }
        });
        await tx.stockBatch.create({
          data: { companyId: user.companyId, branchId: warehouse.branchId, farmId: warehouse.farmId, warehouseId: warehouse.id, productionSiteId: warehouse.productionSiteId, productId: product.id, inventoryItemId: item.id, uomId: product.uomId, batchNumber: `RET-${salesReturn.id.slice(0, 8).toUpperCase()}`, quantityReceived: dto.quantity, quantityRemaining: dto.quantity, unitCost: dto.unitPrice, createdById: user.id }
        });
        await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, productId: product.id, inventoryItemId: item.id, toWarehouseId: warehouse.id, warehouseId: warehouse.id, farmId: warehouse.farmId, productionSiteId: warehouse.productionSiteId, uomId: product.uomId, movementType: "RETURN_IN", quantity: dto.quantity, unitCost: dto.unitPrice, referenceType: "SalesReturn", referenceId: salesReturn.id, notes: dto.reason, createdById: user.id } });
        await this.addCustomerCreditTx(tx, customer.id, customer.branchId, salesReturn.id, totalAmount, `Sales return ${product.sku}`, true);
      }
      return salesReturn;
    });
    await this.writeAudit(user, "CREATE", "SalesReturn", data.id, `Recorded sales return for ${product.sku}`, context, { branchId: customer.branchId, warehouseId: warehouse.id });
    return { data };
  }

  async listReturns(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.salesReturn.findMany({ where: this.returnWhere(user, query), include: { customer: true, product: true, warehouse: true, salesOrder: true }, orderBy: { createdAt: "desc" } });
    return { data };
  }

  async listDeliveryNotes(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.deliveryNote.findMany({ where: this.deliveryWhere(user, query), include: { salesOrder: { include: { customer: true } }, warehouse: true }, orderBy: { deliveryDate: "desc" } });
    return { data };
  }

  async statements(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.customerStatement.findMany({ where: this.statementWhere(user, query), include: { customer: true, invoice: true, payment: true, salesReturn: true }, orderBy: { entryDate: "desc" } });
    return { data };
  }

  async debtors(user: AuthenticatedUser, query: SalesQueryDto) {
    const data = await this.prisma.customerCreditLimit.findMany({
      where: { companyId: user.companyId, deletedAt: null, currentBalance: { gt: 0 }, branchId: query.branchId, customerId: query.customerId, ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) },
      include: { customer: true, branch: true },
      orderBy: { currentBalance: "desc" }
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

  private async salesByProduct(user: AuthenticatedUser, query: SalesQueryDto) {
    const orders = await this.prisma.salesOrder.findMany({ where: this.orderWhere(user, query), include: { items: { include: { product: true } } } });
    const map = new Map<string, { sku: string; product: string; quantity: number; salesValue: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const current = map.get(item.productId) ?? { sku: item.product.sku, product: item.product.name, quantity: 0, salesValue: 0 };
        current.quantity += Number(item.quantity);
        current.salesValue += Number(item.lineTotal);
        map.set(item.productId, current);
      }
    }
    return [...map.values()].sort((a, b) => b.salesValue - a.salesValue);
  }

  private async salesByCustomer(user: AuthenticatedUser, query: SalesQueryDto) {
    const rows = await this.prisma.salesOrder.findMany({ where: this.orderWhere(user, query), include: { customer: true } });
    const map = new Map<string, { code: string; customer: string; orders: number; salesValue: number; balanceDue: number }>();
    for (const row of rows) {
      const current = map.get(row.customerId) ?? { code: row.customer.code, customer: row.customer.name, orders: 0, salesValue: 0, balanceDue: 0 };
      current.orders += 1;
      current.salesValue += Number(row.totalAmount);
      current.balanceDue += Number(row.balanceDue);
      map.set(row.customerId, current);
    }
    return [...map.values()].sort((a, b) => b.salesValue - a.salesValue);
  }

  private async salesByLocation(user: AuthenticatedUser, query: SalesQueryDto) {
    const rows = await this.prisma.salesOrder.findMany({ where: this.orderWhere(user, query), include: { branch: true, warehouse: true } });
    const map = new Map<string, { branch: string; warehouse: string; orders: number; salesValue: number }>();
    for (const row of rows) {
      const key = `${row.branchId}:${row.warehouseId}`;
      const current = map.get(key) ?? { branch: row.branch.name, warehouse: row.warehouse.name, orders: 0, salesValue: 0 };
      current.orders += 1;
      current.salesValue += Number(row.totalAmount);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.salesValue - a.salesValue);
  }

  private async salespersonPerformance(user: AuthenticatedUser, query: SalesQueryDto) {
    const rows = await this.prisma.salesOrder.findMany({ where: this.orderWhere(user, query), select: { salespersonId: true, totalAmount: true, balanceDue: true } });
    const map = new Map<string, { salespersonId: string; orders: number; salesValue: number; collectionsOutstanding: number }>();
    for (const row of rows) {
      const key = row.salespersonId ?? "unassigned";
      const current = map.get(key) ?? { salespersonId: key, orders: 0, salesValue: 0, collectionsOutstanding: 0 };
      current.orders += 1;
      current.salesValue += Number(row.totalAmount);
      current.collectionsOutstanding += Number(row.balanceDue);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.salesValue - a.salesValue);
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

  private async consumeFifoTx(tx: Prisma.TransactionClient, user: AuthenticatedUser, item: InventoryItemContext, quantity: number, referenceType: string, referenceId: string, notes?: string) {
    let remaining = quantity;
    const batches = await tx.stockBatch.findMany({ where: { companyId: user.companyId, inventoryItemId: item.id, quantityRemaining: { gt: 0 }, deletedAt: null }, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }] });
    const available = batches.reduce((sum, batch) => sum + Number(batch.quantityRemaining), 0);
    if (available < quantity || Number(item.quantityOnHand) < quantity) throw new BadRequestException("Insufficient stock to release this sale.");
    for (const batch of batches) {
      if (remaining <= 0) break;
      const issue = Math.min(remaining, Number(batch.quantityRemaining));
      await tx.stockBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { decrement: issue }, status: Number(batch.quantityRemaining) - issue <= 0 ? "CONSUMED" : batch.status } });
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
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantityOnHand: { decrement: quantity }, updatedById: user.id } });
  }

  private async addCustomerDebitTx(tx: Prisma.TransactionClient, customerId: string, branchId: string, invoiceId: string, amount: number, description: string) {
    const credit = await this.ensureCreditLimitTx(tx, customerId, branchId);
    const balance = Number(credit.currentBalance) + amount;
    await tx.customerCreditLimit.update({ where: { id: credit.id }, data: { currentBalance: balance } });
    await tx.customerStatement.create({ data: { companyId: credit.companyId, branchId, customerId, invoiceId, entryType: "INVOICE", debit: amount, credit: 0, balance, description } });
  }

  private async addCustomerCreditTx(tx: Prisma.TransactionClient, customerId: string, branchId: string, referenceId: string, amount: number, description: string, isReturn = false) {
    const credit = await this.ensureCreditLimitTx(tx, customerId, branchId);
    const balance = Math.max(0, Number(credit.currentBalance) - amount);
    await tx.customerCreditLimit.update({ where: { id: credit.id }, data: { currentBalance: balance } });
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
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, ...(user.hasGlobalAccess ? {} : { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] }) };
  }

  private customerWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, id: query.customerId, ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) };
  }

  private priceListWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, productId: query.productId, ...(user.hasGlobalAccess ? {} : { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] }) };
  }

  private orderWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, customerId: query.customerId, warehouseId: query.warehouseId, ...(this.dateRange(query, "orderDate")), ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) };
  }

  private invoiceWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, customerId: query.customerId, ...(this.dateRange(query, "invoiceDate")), ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) };
  }

  private paymentWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, customerId: query.customerId, ...(this.dateRange(query, "paymentDate")), ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) };
  }

  private receiptWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, customerId: query.customerId, ...(this.dateRange(query, "receiptDate")), ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) };
  }

  private returnWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, customerId: query.customerId, productId: query.productId, warehouseId: query.warehouseId, ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) };
  }

  private deliveryWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, warehouseId: query.warehouseId, ...(this.dateRange(query, "deliveryDate")), ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) };
  }

  private statementWhere(user: AuthenticatedUser, query: SalesQueryDto) {
    return { companyId: user.companyId, branchId: query.branchId, customerId: query.customerId, ...(this.dateRange(query, "entryDate")), ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) };
  }

  private assertBranchAccess(user: AuthenticatedUser, branchId: string) {
    if (!user.hasGlobalAccess && !user.branchIds.includes(branchId)) throw new ForbiddenException("You do not have access to this branch.");
  }

  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && !user.warehouseIds.includes(warehouseId)) throw new ForbiddenException("You do not have access to this warehouse.");
  }

  private async nextDocumentNumber(companyId: string, prefix: string, model: { count: (args: { where: { companyId: string } }) => Promise<number> }) {
    const count = await model.count({ where: { companyId } });
    return `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
  }

  private daysFromNow(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "APPROVE", entityType: string, entityId: string, summary: string, context: RequestContext, scope: Scope) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType, entityId, summary, branchId: scope.branchId, warehouseId: scope.warehouseId, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
