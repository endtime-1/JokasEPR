import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../notifications/email.service";
import { PlacePublicOrderDto } from "./dto/public-order.dto";
import { PublicContactDto } from "./dto/public-contact.dto";
import { UpdatePublicProductDto } from "./dto/update-public-product.dto";
import { randomBytes } from "crypto";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  // (L5) The contact page's form previously only did setSent(true) on submit
  // — nothing was ever transmitted anywhere. Emails the submission to the
  // configured contact address (falls back to the address the page itself
  // displays) so a real person actually receives it.
  async submitContact(dto: PublicContactDto) {
    const to = this.config.get<string>("CONTACT_EMAIL", "info@akokosolutionsgh.com");
    const html = `
      <p><b>New storefront contact message</b></p>
      <p><b>Name:</b> ${escapeHtml(dto.name)}<br/>
      <b>Phone:</b> ${escapeHtml(dto.phone)}<br/>
      ${dto.email ? `<b>Email:</b> ${escapeHtml(dto.email)}<br/>` : ""}
      ${dto.subject ? `<b>Subject:</b> ${escapeHtml(dto.subject)}<br/>` : ""}</p>
      <p>${escapeHtml(dto.message).replace(/\n/g, "<br/>")}</p>
    `;
    const sent = await this.email.send(to, dto.subject ? `Contact form: ${dto.subject}` : "New storefront contact message", html);
    if (!sent) {
      this.logger.error(`Contact form email failed to send to ${to} (SMTP not configured or send failed)`);
      throw new InternalServerErrorException("Could not send your message right now. Please call or WhatsApp us instead.");
    }
    return { sent: true };
  }

  // Resolve the storefront company. Prefer STOREFRONT_COMPANY_ID env var (explicit).
  // Name-based fallback is kept for backwards compatibility but logs a warning because
  // a name match can silently target the wrong company in multi-tenant setups.
  private async getStorefrontCompanyId(): Promise<string> {
    const envId = this.config.get<string>("STOREFRONT_COMPANY_ID");
    if (envId) return envId;

    // TODO: Set STOREFRONT_COMPANY_ID in production .env and remove this fallback.
    const company = await this.prisma.company.findFirst({
      where: { name: { contains: "Akoko" }, status: "ACTIVE" },
      select: { id: true },
    });
    if (!company) throw new BadRequestException("Store configuration error. Please contact us directly.");
    return company.id;
  }

  async listProducts(category?: string) {
    const companyId = await this.getStorefrontCompanyId();
    const where: Record<string, unknown> = { companyId, isPublic: true, deletedAt: null, status: "ACTIVE" };
    if (category) where.storefrontCategory = category;

    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true, name: true, sku: true, publicSlug: true, publicDescription: true,
        publicImageUrl: true, storefrontCategory: true, minOrderQty: true, unitLabel: true,
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
      id: p.id, name: p.name, sku: p.sku, slug: p.publicSlug, description: p.publicDescription,
      imageUrl: p.publicImageUrl, category: p.storefrontCategory,
      minOrderQty: p.minOrderQty ? Number(p.minOrderQty) : 1,
      unitLabel: p.unitLabel ?? "unit",
      unitPrice: p.priceLists[0]?.unitPrice ? Number(p.priceLists[0].unitPrice) : null,
    }));
  }

  async getProduct(slug: string) {
    const companyId = await this.getStorefrontCompanyId();
    const p = await this.prisma.product.findFirst({
      where: { companyId, publicSlug: slug, isPublic: true, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true, name: true, sku: true, publicSlug: true, publicDescription: true,
        publicImageUrl: true, storefrontCategory: true, minOrderQty: true, unitLabel: true,
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
      id: p.id, name: p.name, sku: p.sku, slug: p.publicSlug, description: p.publicDescription,
      imageUrl: p.publicImageUrl, category: p.storefrontCategory,
      minOrderQty: p.minOrderQty ? Number(p.minOrderQty) : 1,
      unitLabel: p.unitLabel ?? "unit",
      unitPrice: p.priceLists[0]?.unitPrice ? Number(p.priceLists[0].unitPrice) : null,
    };
  }

  async placeOrder(dto: PlacePublicOrderDto) {
    const companyId = await this.getStorefrontCompanyId();

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, status: "ACTIVE" },
      include: {
        branches:   { where: { status: "ACTIVE" }, take: 1 },
        warehouses: { where: { status: "ACTIVE" }, take: 1 },
      },
    });

    if (!company || !company.branches[0] || !company.warehouses[0]) {
      throw new BadRequestException("Store configuration error. Please contact us directly.");
    }

    const branch    = company.branches[0];
    const warehouse = company.warehouses[0];

    const productIds = dto.lines.map((l) => l.productId);
    const products   = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isPublic: true, companyId: company.id },
      include: {
        priceLists: { where: { status: "ACTIVE" }, orderBy: { validFrom: "desc" }, take: 1 },
      },
    });

    if (products.length !== dto.lines.length) {
      throw new BadRequestException("One or more products are unavailable.");
    }

    const orderItems = dto.lines.map((line) => {
      const product  = products.find((p) => p.id === line.productId)!;
      const unitPrice = Number(product.priceLists[0]?.unitPrice ?? 0);
      return { product, line, unitPrice, total: unitPrice * line.quantity };
    });

    // M7: minOrderQty was fetched for display on the browse endpoints but
    // never actually enforced here, and a product with no active price-list
    // row silently resolved to unitPrice = 0 with no guard — either gap let
    // an anonymous storefront visitor place a $0 order.
    const belowMinQty = orderItems.filter((i) => i.line.quantity < (i.product.minOrderQty ? Number(i.product.minOrderQty) : 1));
    if (belowMinQty.length) {
      const names = belowMinQty.map((i) => `${i.product.name} (min ${Number(i.product.minOrderQty ?? 1)})`).join(", ");
      throw new BadRequestException(`Quantity below minimum order for: ${names}.`);
    }
    const unpriced = orderItems.filter((i) => i.unitPrice <= 0);
    if (unpriced.length) {
      const names = unpriced.map((i) => i.product.name).join(", ");
      throw new BadRequestException(`These products are currently unavailable for online ordering: ${names}.`);
    }

    // (M19) Was created before any of the validation above — every rejected
    // attempt (unavailable product, below minOrderQty, unpriced product) still
    // left a permanent, orphaned Customer row behind with no order attached.
    // Always create a new anonymous customer record per storefront order —
    // reusing an existing customer by phone alone allows phone spoofing to
    // access another customer's account history and credit terms.
    const customer = await this.prisma.customer.create({
      data: {
        companyId:  company.id,
        branchId:   branch.id,
        code:       `WEB-${randomBytes(4).toString("hex").toUpperCase()}`,
        name:       dto.customerName,
        phone:      dto.customerPhone,
        email:      dto.customerEmail,
        address:    dto.deliveryAddress,
      },
    });

    const subtotal      = orderItems.reduce((sum, i) => sum + i.total, 0);
    // Both references are fully random — sequential numbers allow order enumeration
    // and count + 1 has a race condition under concurrent requests.
    const storefrontRef = `AKO-${randomBytes(6).toString("hex").toUpperCase()}`;
    const orderNumber   = `SO-WEB-${randomBytes(5).toString("hex").toUpperCase()}`;

    await this.prisma.salesOrder.create({
      data: {
        companyId:                  company.id,
        branchId:                   branch.id,
        customerId:                 customer.id,
        warehouseId:                warehouse.id,
        orderNumber,
        orderDate:                  new Date(),
        status:                     "PENDING_STOCK_APPROVAL",
        subtotal,
        totalAmount:                subtotal,
        balanceDue:                 subtotal,
        notes:                      dto.notes,
        isStorefrontOrder:          true,
        storefrontRef,
        storefrontCustomerName:     dto.customerName,
        storefrontCustomerPhone:    dto.customerPhone,
        storefrontCustomerEmail:    dto.customerEmail,
        storefrontDeliveryAddress:  dto.deliveryAddress,
        items: {
          create: orderItems.map((i) => ({
            companyId:  company.id,
            productId:  i.product.id,
            quantity:   i.line.quantity,
            unitPrice:  i.unitPrice,
            lineTotal:  i.total,
          })),
        },
      },
    });

    return {
      storefrontRef,
      orderNumber,
      status: "PENDING",
      message: "Your order has been received. Our team will confirm and arrange delivery.",
      estimatedResponse: "Within 2 business hours",
    };
  }

  /* ── Storefront admin methods — all scoped to companyId ─────────── */

  async adminListProducts(companyId: string, search?: string) {
    const where: Record<string, unknown> = { companyId, deletedAt: null, status: "ACTIVE" };
    if (search) where.name = { contains: search };

    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true, name: true, sku: true, isPublic: true, publicSlug: true,
        publicDescription: true, publicImageUrl: true, storefrontCategory: true,
        minOrderQty: true, unitLabel: true,
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
      id: p.id, name: p.name, sku: p.sku, isPublic: p.isPublic,
      publicSlug: p.publicSlug, publicDescription: p.publicDescription,
      publicImageUrl: p.publicImageUrl, storefrontCategory: p.storefrontCategory,
      minOrderQty: p.minOrderQty ? Number(p.minOrderQty) : 1,
      unitLabel: p.unitLabel,
      unitPrice: p.priceLists[0]?.unitPrice ? Number(p.priceLists[0].unitPrice) : null,
    }));
  }

  async adminUpdateProduct(companyId: string, id: string, dto: UpdatePublicProductDto) {
    // Verify ownership before writing — prevents cross-tenant writes
    const existing = await this.prisma.product.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException("Product not found.");

    const data: Record<string, unknown> = {};
    if (dto.isPublic          !== undefined) data.isPublic          = dto.isPublic;
    if (dto.publicSlug        !== undefined) data.publicSlug        = dto.publicSlug;
    if (dto.publicDescription !== undefined) data.publicDescription = dto.publicDescription;
    if (dto.storefrontCategory !== undefined) data.storefrontCategory = dto.storefrontCategory;
    if (dto.minOrderQty       !== undefined) data.minOrderQty       = dto.minOrderQty;
    if (dto.unitLabel         !== undefined) data.unitLabel         = dto.unitLabel;

    const product = await this.prisma.product.update({ where: { id }, data });

    if (dto.unitPrice !== undefined && dto.unitPrice > 0) {
      const existingPrice = await this.prisma.priceList.findFirst({
        where: { productId: id, status: "ACTIVE" },
        orderBy: { validFrom: "desc" },
      });
      if (existingPrice) {
        await this.prisma.priceList.update({ where: { id: existingPrice.id }, data: { unitPrice: dto.unitPrice } });
      } else {
        await this.prisma.priceList.create({
          data: { companyId, productId: id, name: "Storefront Price", unitPrice: dto.unitPrice, currency: "GHS", status: "ACTIVE" },
        });
      }
    }

    return { id: product.id, isPublic: product.isPublic, publicSlug: product.publicSlug };
  }

  async adminListOrders(companyId: string, status?: string, search?: string) {
    const where: Record<string, unknown> = { companyId, isStorefrontOrder: true, deletedAt: null };
    if (status && status !== "ALL") where.status = status;
    if (search) {
      where.OR = [
        { storefrontCustomerName:  { contains: search } },
        { storefrontCustomerPhone: { contains: search } },
        { storefrontRef:           { contains: search } },
        { orderNumber:             { contains: search } },
      ];
    }

    const orders = await this.prisma.salesOrder.findMany({
      where,
      select: {
        id: true, orderNumber: true, storefrontRef: true, status: true, orderDate: true,
        totalAmount: true, storefrontCustomerName: true, storefrontCustomerPhone: true,
        storefrontCustomerEmail: true, storefrontDeliveryAddress: true, notes: true,
        items: {
          select: {
            quantity: true, unitPrice: true, lineTotal: true,
            product: { select: { name: true, unitLabel: true } },
          },
        },
      },
      orderBy: { orderDate: "desc" },
      take: 200,
    });

    const statusLabel: Record<string, string> = {
      DRAFT: "Draft", PENDING_STOCK_APPROVAL: "Pending",
      APPROVED: "Confirmed", FULFILLED: "Delivered", CANCELLED: "Cancelled",
    };

    return orders.map((o) => ({
      id: o.id, orderNumber: o.orderNumber, ref: o.storefrontRef,
      status: o.status, statusLabel: statusLabel[o.status] ?? o.status,
      orderDate: o.orderDate, total: Number(o.totalAmount),
      customer: {
        name:    o.storefrontCustomerName,
        phone:   o.storefrontCustomerPhone,
        email:   o.storefrontCustomerEmail,
        address: o.storefrontDeliveryAddress,
      },
      notes: o.notes,
      items: o.items.map((i) => ({
        name:      (i.product as { name: string; unitLabel?: string | null }).name,
        qty:       Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        total:     Number(i.lineTotal),
      })),
    }));
  }

  async adminUpdateOrderStatus(companyId: string, id: string, status: string) {
    const allowed = ["PENDING_STOCK_APPROVAL", "APPROVED", "FULFILLED", "CANCELLED"];
    if (!allowed.includes(status)) throw new BadRequestException("Invalid status");
    // Verify ownership before writing — prevents cross-tenant writes
    const existing = await this.prisma.salesOrder.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException("Order not found.");
    const order = await this.prisma.salesOrder.update({ where: { id }, data: { status: status as never } });
    return { id: order.id, status: order.status };
  }

  async adminStats(companyId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const baseWhere = { companyId, isStorefrontOrder: true };

    const [published, totalProducts, pending, confirmed, delivered, cancelled, total, revenueAgg, recentOrders, recentRevAgg] =
      await Promise.all([
        this.prisma.product.count({ where: { companyId, isPublic: true, deletedAt: null, status: "ACTIVE" } }),
        this.prisma.product.count({ where: { companyId, deletedAt: null, status: "ACTIVE" } }),
        this.prisma.salesOrder.count({ where: { ...baseWhere, status: "PENDING_STOCK_APPROVAL" } }),
        this.prisma.salesOrder.count({ where: { ...baseWhere, status: "APPROVED" } }),
        this.prisma.salesOrder.count({ where: { ...baseWhere, status: "FULFILLED" } }),
        this.prisma.salesOrder.count({ where: { ...baseWhere, status: "CANCELLED" } }),
        this.prisma.salesOrder.count({ where: baseWhere }),
        this.prisma.salesOrder.aggregate({
          where: { ...baseWhere, status: { in: ["APPROVED", "FULFILLED"] } },
          _sum: { totalAmount: true },
        }),
        this.prisma.salesOrder.findMany({
          where: baseWhere,
          select: {
            id: true, orderNumber: true, storefrontRef: true, status: true, orderDate: true,
            totalAmount: true, storefrontCustomerName: true, storefrontCustomerPhone: true,
            items: { select: { quantity: true, product: { select: { name: true } } }, take: 3 },
          },
          orderBy: { orderDate: "desc" },
          take: 8,
        }),
        this.prisma.salesOrder.aggregate({
          where: { ...baseWhere, status: { in: ["APPROVED", "FULFILLED"] }, orderDate: { gte: thirtyDaysAgo } },
          _sum: { totalAmount: true },
        }),
      ]);

    const statusLabel: Record<string, string> = {
      PENDING_STOCK_APPROVAL: "Pending", APPROVED: "Confirmed",
      FULFILLED: "Delivered", CANCELLED: "Cancelled",
    };

    return {
      published, totalProducts, pending, confirmed, delivered, cancelled, total,
      totalRevenue:      Number(revenueAgg._sum.totalAmount ?? 0),
      revenueThisMonth:  Number(recentRevAgg._sum.totalAmount ?? 0),
      recentOrders: recentOrders.map((o) => ({
        id: o.id, orderNumber: o.orderNumber, ref: o.storefrontRef,
        status: o.status, statusLabel: statusLabel[o.status] ?? o.status,
        orderDate: o.orderDate, total: Number(o.totalAmount),
        customerName:  o.storefrontCustomerName,
        customerPhone: o.storefrontCustomerPhone,
        itemSummary: o.items
          .map((i) => `${(i.product as { name: string }).name} ×${Number(i.quantity)}`)
          .join(", "),
      })),
    };
  }

  async updateProductImageUrl(companyId: string, id: string, filename: string) {
    // Verify ownership before writing — prevents cross-tenant writes
    const existing = await this.prisma.product.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException("Product not found.");
    const imageUrl = `/api/v1/uploads/products/${filename}`;
    await this.prisma.product.update({ where: { id }, data: { publicImageUrl: imageUrl } });
    return imageUrl;
  }

  async getOrderStatus(ref: string) {
    const order = await this.prisma.salesOrder.findUnique({
      where: { storefrontRef: ref },
      select: {
        orderNumber: true, status: true, orderDate: true, totalAmount: true,
        storefrontCustomerName: true, storefrontDeliveryAddress: true,
        items: {
          select: {
            quantity: true, unitPrice: true, lineTotal: true,
            product: { select: { name: true, unitLabel: true } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException("Order not found");

    const statusLabel: Record<string, string> = {
      DRAFT: "Processing", PENDING_STOCK_APPROVAL: "Pending Confirmation",
      APPROVED: "Confirmed — Preparing", FULFILLED: "Delivered", CANCELLED: "Cancelled",
    };

    return {
      storefrontRef: ref,
      orderNumber:   order.orderNumber,
      status:        order.status,
      statusLabel:   statusLabel[order.status] ?? order.status,
      createdAt:     order.orderDate,
      total:         Number(order.totalAmount),
      customerName:  order.storefrontCustomerName,
      deliveryAddress: order.storefrontDeliveryAddress,
      lines: order.items.map((i) => ({
        productName: (i.product as { name: string; unitLabel?: string | null }).name,
        qty:         Number(i.quantity),
        unitPrice:   Number(i.unitPrice),
      })),
    };
  }
}
