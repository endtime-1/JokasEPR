import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PlacePublicOrderDto } from "./dto/public-order.dto";
import { randomBytes } from "crypto";

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(category?: string) {
    const where: Record<string, unknown> = { isPublic: true, deletedAt: null, status: "ACTIVE" };
    if (category) where.storefrontCategory = category;

    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        publicSlug: true,
        publicDescription: true,
        publicImageUrl: true,
        storefrontCategory: true,
        minOrderQty: true,
        unitLabel: true,
        priceLists: {
          where: { status: "ACTIVE" },
          select: { unitPrice: true },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
      },
      orderBy: [{ storefrontCategory: "asc" }, { name: "asc" }],
    });

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      slug: p.publicSlug,
      description: p.publicDescription,
      imageUrl: p.publicImageUrl,
      category: p.storefrontCategory,
      minOrderQty: p.minOrderQty ? Number(p.minOrderQty) : 1,
      unitLabel: p.unitLabel ?? "unit",
      unitPrice: p.priceLists[0]?.unitPrice ? Number(p.priceLists[0].unitPrice) : null,
    }));
  }

  async getProduct(slug: string) {
    const p = await this.prisma.product.findFirst({
      where: { publicSlug: slug, isPublic: true, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        sku: true,
        publicSlug: true,
        publicDescription: true,
        publicImageUrl: true,
        storefrontCategory: true,
        minOrderQty: true,
        unitLabel: true,
        priceLists: {
          where: { status: "ACTIVE" },
          select: { unitPrice: true },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
      },
    });

    if (!p) throw new NotFoundException("Product not found");

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      slug: p.publicSlug,
      description: p.publicDescription,
      imageUrl: p.publicImageUrl,
      category: p.storefrontCategory,
      minOrderQty: p.minOrderQty ? Number(p.minOrderQty) : 1,
      unitLabel: p.unitLabel ?? "unit",
      unitPrice: p.priceLists[0]?.unitPrice ? Number(p.priceLists[0].unitPrice) : null,
    };
  }

  async placeOrder(dto: PlacePublicOrderDto) {
    // Find Akoko Solutions company
    const company = await this.prisma.company.findFirst({
      where: { name: { contains: "Akoko" }, status: "ACTIVE" },
      include: {
        branches: { where: { status: "ACTIVE" }, take: 1 },
        warehouses: { where: { status: "ACTIVE" }, take: 1 },
      },
    });

    if (!company || !company.branches[0] || !company.warehouses[0]) {
      throw new BadRequestException("Store configuration error. Please contact us directly.");
    }

    const branch = company.branches[0];
    const warehouse = company.warehouses[0];

    // Find or create customer record
    let customer = await this.prisma.customer.findFirst({
      where: {
        companyId: company.id,
        phone: dto.customerPhone,
        deletedAt: null,
      },
    });

    if (!customer) {
      const count = await this.prisma.customer.count({ where: { companyId: company.id } });
      customer = await this.prisma.customer.create({
        data: {
          companyId: company.id,
          branchId: branch.id,
          code: `WEB-${String(count + 1).padStart(4, "0")}`,
          name: dto.customerName,
          phone: dto.customerPhone,
          email: dto.customerEmail,
          address: dto.deliveryAddress,
        },
      });
    }

    // Resolve products and prices
    const productIds = dto.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isPublic: true, companyId: company.id },
      include: {
        priceLists: {
          where: { status: "ACTIVE" },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
      },
    });

    if (products.length !== dto.lines.length) {
      throw new BadRequestException("One or more products are unavailable.");
    }

    const orderItems = dto.lines.map((line) => {
      const product = products.find((p) => p.id === line.productId)!;
      const unitPrice = product.priceLists[0]?.unitPrice ?? 0;
      const total = Number(unitPrice) * line.quantity;
      return { product, line, unitPrice: Number(unitPrice), total };
    });

    const subtotal = orderItems.reduce((sum, i) => sum + i.total, 0);
    const storefrontRef = `AKO-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
    const orderCount = await this.prisma.salesOrder.count({ where: { companyId: company.id } });
    const orderNumber = `SO-WEB-${String(orderCount + 1).padStart(5, "0")}`;

    const order = await this.prisma.salesOrder.create({
      data: {
        companyId: company.id,
        branchId: branch.id,
        customerId: customer.id,
        warehouseId: warehouse.id,
        orderNumber,
        orderDate: new Date(),
        status: "PENDING_STOCK_APPROVAL",
        subtotal,
        totalAmount: subtotal,
        balanceDue: subtotal,
        notes: dto.notes,
        isStorefrontOrder: true,
        storefrontRef,
        storefrontCustomerName: dto.customerName,
        storefrontCustomerPhone: dto.customerPhone,
        storefrontCustomerEmail: dto.customerEmail,
        storefrontDeliveryAddress: dto.deliveryAddress,
        items: {
          create: orderItems.map((i) => ({
            companyId: company.id,
            productId: i.product.id,
            quantity: i.line.quantity,
            unitPrice: i.unitPrice,
            lineTotal: i.total,
          })),
        },
      },
    });

    return {
      ref: storefrontRef,
      orderNumber,
      status: "PENDING",
      message: "Your order has been received. Our team will confirm and arrange delivery.",
      estimatedResponse: "Within 2 business hours",
    };
  }

  /* ── Storefront admin methods ─────────────────────────────────────── */

  async adminListProducts(search?: string) {
    const where: Record<string, unknown> = { deletedAt: null, status: "ACTIVE" };
    if (search) where.name = { contains: search, mode: "insensitive" };

    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        isPublic: true,
        publicSlug: true,
        publicDescription: true,
        storefrontCategory: true,
        minOrderQty: true,
        unitLabel: true,
        priceLists: {
          where: { status: "ACTIVE" },
          select: { unitPrice: true },
          orderBy: { validFrom: "desc" },
          take: 1,
        },
      },
      orderBy: [{ storefrontCategory: "asc" }, { name: "asc" }],
    });

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      isPublic: p.isPublic,
      publicSlug: p.publicSlug,
      publicDescription: p.publicDescription,
      storefrontCategory: p.storefrontCategory,
      minOrderQty: p.minOrderQty ? Number(p.minOrderQty) : 1,
      unitLabel: p.unitLabel,
      unitPrice: p.priceLists[0]?.unitPrice ? Number(p.priceLists[0].unitPrice) : null,
    }));
  }

  async adminUpdateProduct(id: string, body: Record<string, unknown>) {
    const allowed = ["isPublic", "publicSlug", "publicDescription", "storefrontCategory", "minOrderQty", "unitLabel"];
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) data[key] = body[key];
    }
    if (data.minOrderQty !== undefined) data.minOrderQty = Number(data.minOrderQty);

    const product = await this.prisma.product.update({ where: { id }, data });
    return { id: product.id, isPublic: product.isPublic, publicSlug: product.publicSlug };
  }

  async adminListOrders(status?: string, search?: string) {
    const where: Record<string, unknown> = { isStorefrontOrder: true, deletedAt: null };
    if (status && status !== "ALL") where.status = status;
    if (search) {
      where.OR = [
        { storefrontCustomerName: { contains: search, mode: "insensitive" } },
        { storefrontCustomerPhone: { contains: search } },
        { storefrontRef: { contains: search } },
        { orderNumber: { contains: search } },
      ];
    }

    const orders = await this.prisma.salesOrder.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        storefrontRef: true,
        status: true,
        orderDate: true,
        totalAmount: true,
        storefrontCustomerName: true,
        storefrontCustomerPhone: true,
        storefrontCustomerEmail: true,
        storefrontDeliveryAddress: true,
        notes: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            product: { select: { name: true, unitLabel: true } },
          },
        },
      },
      orderBy: { orderDate: "desc" },
      take: 200,
    });

    const statusLabel: Record<string, string> = {
      DRAFT: "Draft",
      PENDING_STOCK_APPROVAL: "Pending",
      APPROVED: "Confirmed",
      FULFILLED: "Delivered",
      CANCELLED: "Cancelled",
    };

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      ref: o.storefrontRef,
      status: o.status,
      statusLabel: statusLabel[o.status] ?? o.status,
      orderDate: o.orderDate,
      total: Number(o.totalAmount),
      customer: {
        name: o.storefrontCustomerName,
        phone: o.storefrontCustomerPhone,
        email: o.storefrontCustomerEmail,
        address: o.storefrontDeliveryAddress,
      },
      notes: o.notes,
      items: o.items.map((i) => ({
        name: (i.product as { name: string; unitLabel?: string | null }).name,
        qty: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        total: Number(i.lineTotal),
      })),
    }));
  }

  async adminUpdateOrderStatus(id: string, status: string) {
    const allowed = ["PENDING_STOCK_APPROVAL", "APPROVED", "FULFILLED", "CANCELLED"];
    if (!allowed.includes(status)) throw new BadRequestException("Invalid status");
    const order = await this.prisma.salesOrder.update({ where: { id }, data: { status: status as never } });
    return { id: order.id, status: order.status };
  }

  async adminStats() {
    const [published, pending, confirmed, delivered, total] = await Promise.all([
      this.prisma.product.count({ where: { isPublic: true, deletedAt: null, status: "ACTIVE" } }),
      this.prisma.salesOrder.count({ where: { isStorefrontOrder: true, status: "PENDING_STOCK_APPROVAL" } }),
      this.prisma.salesOrder.count({ where: { isStorefrontOrder: true, status: "APPROVED" } }),
      this.prisma.salesOrder.count({ where: { isStorefrontOrder: true, status: "FULFILLED" } }),
      this.prisma.salesOrder.count({ where: { isStorefrontOrder: true } }),
    ]);
    return { published, pending, confirmed, delivered, total };
  }

  async getOrderStatus(ref: string) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { storefrontRef: ref },
      select: {
        orderNumber: true,
        status: true,
        orderDate: true,
        totalAmount: true,
        storefrontCustomerName: true,
        storefrontDeliveryAddress: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            product: { select: { name: true, unitLabel: true } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException("Order not found");

    const statusLabel: Record<string, string> = {
      DRAFT: "Processing",
      PENDING_STOCK_APPROVAL: "Pending Confirmation",
      APPROVED: "Confirmed — Preparing",
      FULFILLED: "Delivered",
      CANCELLED: "Cancelled",
    };

    return {
      ref,
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: statusLabel[order.status] ?? order.status,
      orderDate: order.orderDate,
      total: Number(order.totalAmount),
      customerName: order.storefrontCustomerName,
      deliveryAddress: order.storefrontDeliveryAddress,
      items: order.items.map((i) => ({
        name: (i.product as { name: string; unitLabel?: string | null }).name,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        total: Number(i.lineTotal),
      })),
    };
  }
}
