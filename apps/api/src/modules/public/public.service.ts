import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../notifications/email.service";
import { PlacePublicOrderDto } from "./dto/public-order.dto";
import { PublicContactDto } from "./dto/public-contact.dto";
import { RetailerApplicationDto } from "./dto/retailer-application.dto";
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
    const companyId = await this.getStorefrontCompanyId();
    // Save first: the enquiry must survive even when SMTP is down or unset.
    const lead = await this.prisma.storefrontLead.create({
      data: { companyId, kind: "CONTACT", name: dto.name, phone: dto.phone, email: dto.email, subject: dto.subject, message: dto.message },
    });
    const html = `
      <p><b>New storefront contact message</b></p>
      <p><b>Name:</b> ${escapeHtml(dto.name)}<br/>
      <b>Phone:</b> ${escapeHtml(dto.phone)}<br/>
      ${dto.email ? `<b>Email:</b> ${escapeHtml(dto.email)}<br/>` : ""}
      ${dto.subject ? `<b>Subject:</b> ${escapeHtml(dto.subject)}<br/>` : ""}</p>
      <p>${escapeHtml(dto.message).replace(/\n/g, "<br/>")}</p>
    `;
    await this.notify(this.config.get<string>("CONTACT_EMAIL", "farmersupport@akokofeeds.com"), dto.subject ? `Contact form: ${dto.subject}` : "New storefront contact message", html, lead.id);
    return { sent: true };
  }

  // "Become a Retailer" application -> saved, then emailed to sales (with a copy).
  async submitRetailerApplication(dto: RetailerApplicationDto) {
    const companyId = await this.getStorefrontCompanyId();
    const lead = await this.prisma.storefrontLead.create({
      data: {
        companyId, kind: "RETAILER", name: dto.name, location: dto.location, phone: dto.phone, email: dto.email,
        isDistributor: dto.isDistributor, distributorFeed: dto.isDistributor ? dto.distributorFeed : undefined,
      },
    });
    const html = `
      <p><b>New retailer application (akokofeeds.com)</b></p>
      <p><b>Name:</b> ${escapeHtml(dto.name)}<br/>
      <b>Location:</b> ${escapeHtml(dto.location)}<br/>
      <b>Contact:</b> ${escapeHtml(dto.phone)}<br/>
      ${dto.email ? `<b>Email:</b> ${escapeHtml(dto.email)}<br/>` : ""}
      <b>Already a distributor?</b> ${dto.isDistributor ? "Yes" : "No"}<br/>
      ${dto.isDistributor && dto.distributorFeed ? `<b>Which feed:</b> ${escapeHtml(dto.distributorFeed)}<br/>` : ""}</p>
    `;
    await this.notify(this.config.get<string>("SALES_EMAIL", "sales@akokofeeds.com"), `Retailer application: ${dto.name} (${dto.location})`, html, lead.id, this.config.get<string>("SALES_COPY_EMAIL", "akokofeeds@gmail.com"));
    return { received: true };
  }

  // Best-effort email: the lead is already saved, so a mail failure is logged,
  // never shown to the visitor as an error.
  private async notify(to: string, subject: string, html: string, leadId: string, copyTo?: string) {
    for (const address of [to, copyTo].filter((a): a is string => !!a)) {
      const ok = await this.email.send(address, subject, html).catch(() => false);
      if (!ok) this.logger.error(`Lead ${leadId}: notification email to ${address} failed (SMTP not configured?). The lead is saved in the database.`);
    }
  }

  async adminListLeads(companyId: string, status?: string) {
    const where: Record<string, unknown> = { companyId };
    if (status && status !== "ALL") where.status = status;
    const data = await this.prisma.storefrontLead.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 });
    return { data };
  }

  async adminUpdateLeadStatus(companyId: string, id: string, status: string) {
    if (!["NEW", "CONTACTED", "CLOSED"].includes(status)) throw new BadRequestException("Unknown status.");
    const existing = await this.prisma.storefrontLead.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException("Lead not found.");
    const data = await this.prisma.storefrontLead.update({ where: { id }, data: { status } });
    return { data };
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
    const where: Record<string, unknown> = { companyId, isPublic: true, deletedAt: null, status: "ACTIVE", publicSlug: { not: null } };
    if (category) where.storefrontCategory = category;

    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true, name: true, publicSlug: true, publicDescription: true,
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

    // M-BUG: the internal SKU code was included in this public,
    // unauthenticated response even though the storefront UI never reads or
    // displays it — anyone calling the API directly (or scraping it) could
    // read internal catalog codes for free.
    return products.map((p) => ({
      id: p.id, name: p.name, slug: p.publicSlug, description: p.publicDescription,
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
        id: true, name: true, publicSlug: true, publicDescription: true,
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
      id: p.id, name: p.name, slug: p.publicSlug, description: p.publicDescription,
      imageUrl: p.publicImageUrl, category: p.storefrontCategory,
      minOrderQty: p.minOrderQty ? Number(p.minOrderQty) : 1,
      unitLabel: p.unitLabel ?? "unit",
      unitPrice: p.priceLists[0]?.unitPrice ? Number(p.priceLists[0].unitPrice) : null,
    };
  }

  async placeOrder(dto: PlacePublicOrderDto) {
    const companyId = await this.getStorefrontCompanyId();

    // A client retry after a dropped response (timeout, connection reset —
    // it never learned whether the first attempt landed) previously had no
    // way to avoid placing a second real order for the same checkout. A
    // resend carrying the same idempotencyKey replays the original result
    // instead of creating a duplicate.
    if (dto.idempotencyKey) {
      const existing = await this.findOrderByIdempotencyKey(companyId, dto.idempotencyKey);
      if (existing) return existing;
    }

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
    // Feeds without an online price are ORDER REQUESTS, not instant sales: the order
    // is saved flagged "PRICE TO BE CONFIRMED" and a team member calls the customer,
    // agrees the price, adds delivery for their location and gives the total. It stays
    // PENDING_STOCK_APPROVAL, so nothing is invoiced or released until staff review it.
    const unpriced = orderItems.filter((i) => i.unitPrice <= 0);
    const pricingNote = unpriced.length ? `PRICE TO BE CONFIRMED: ${unpriced.map((i) => i.product.name).join(", ")}. ` : "";
    const orderNotes = (pricingNote + (dto.notes ?? "")).slice(0, 500) || undefined; // column is VARCHAR(500)

    const subtotal      = orderItems.reduce((sum, i) => sum + i.total, 0);
    // Both references are fully random — sequential numbers allow order enumeration
    // and count + 1 has a race condition under concurrent requests.
    const storefrontRef = `AKO-${randomBytes(6).toString("hex").toUpperCase()}`;
    const orderNumber   = `SO-WEB-${randomBytes(5).toString("hex").toUpperCase()}`;

    try {
      // (M19) Customer + SalesOrder used to be created as two separate
      // unguarded calls after all validation above — a failure between them
      // (or a losing concurrent retry racing the idempotencyKey check above)
      // could still leave a permanent, orphaned Customer row with no order
      // attached. One transaction means either both land or neither does.
      // Always create a new anonymous customer record per storefront order —
      // reusing an existing customer by phone alone allows phone spoofing to
      // access another customer's account history and credit terms.
      await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
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

        await tx.salesOrder.create({
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
            notes:                      orderNotes,
            isStorefrontOrder:          true,
            storefrontRef,
            storefrontCustomerName:     dto.customerName,
            storefrontCustomerPhone:    dto.customerPhone,
            storefrontCustomerEmail:    dto.customerEmail,
            storefrontDeliveryAddress:  dto.deliveryAddress,
            idempotencyKey:             dto.idempotencyKey,
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
      });
    } catch (err: unknown) {
      // The pre-check above has a race window — two requests carrying the
      // same idempotencyKey can both pass it and both start a transaction.
      // The unique (companyId, idempotencyKey) index makes the DB the final
      // arbiter: the loser's insert fails with P2002, and instead of
      // surfacing that as an error, it replays the winner's result.
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findOrderByIdempotencyKey(companyId, dto.idempotencyKey);
        if (existing) return existing;
      }
      throw err;
    }

    return {
      storefrontRef,
      orderNumber,
      status: "PENDING",
      message: unpriced.length
        ? "Your order request has been received. Our team will contact you to confirm the price and delivery, then give you your total."
        : "Your order has been received. Our team will confirm and arrange delivery.",
      estimatedResponse: "Within 2 business hours",
    };
  }

  private async findOrderByIdempotencyKey(companyId: string, idempotencyKey: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { companyId, idempotencyKey, deletedAt: null },
    });
    if (!order) return null;
    return {
      storefrontRef: order.storefrontRef!,
      orderNumber: order.orderNumber,
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

    // Publishing must always leave the product reachable: the ERP's quick
    // "publish" toggle sends only isPublic, which used to publish a product with
    // no web address (broken /products/null link, 404 page) and no category
    // (invisible under every category filter). Fill both in when missing.
    if (dto.isPublic === true) {
      const slug = (data.publicSlug as string | undefined) ?? existing.publicSlug;
      if (!slug) data.publicSlug = await this.uniqueSlug(companyId, existing.name, id);
      const category = (data.storefrontCategory as string | undefined) ?? existing.storefrontCategory;
      if (!category && /mash|concentrate|feed|starter|finisher|layer|developer|prelay/i.test(existing.name)) data.storefrontCategory = "Feed";
    }

    const product = await this.prisma.product.update({ where: { id }, data });

    // Clearing the price box sends 0: that must REMOVE the price. Before, only
    // prices above zero were handled, so a cleared price silently came back on
    // refresh. All of the product's active prices are switched off (kept for
    // the record, not deleted), so no older price can reappear on the shop.
    // Typing a price again creates a fresh active one below.
    if ((dto.unitPrice as number | null | undefined) === null || dto.unitPrice === 0) {
      await this.prisma.priceList.updateMany({
        where: { productId: id, companyId, status: "ACTIVE", deletedAt: null },
        data: { status: "INACTIVE" },
      });
    }

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

  // One click: publish every active finished feed product (mash / concentrate
  // etc.) to akokofeeds.com. Raw materials and non-feed items are left alone.
  // Each gets a web address, the Feed category and a "50 kg bag" label if it has none.
  async adminPublishFeedProducts(companyId: string) {
    const FEED_NAME = /mash|concentrate|starter|finisher|layer|developer|pre-?lay|super\s*chick|chick/i;
    const candidates = await this.prisma.product.findMany({
      where: { companyId, status: "ACTIVE", deletedAt: null, type: "FINISHED_GOOD", isPublic: false },
      select: { id: true, name: true, publicSlug: true, storefrontCategory: true, unitLabel: true, minOrderQty: true, uom: { select: { name: true, code: true, symbol: true } } },
    });
    const feeds = candidates.filter((p) => FEED_NAME.test(p.name));
    const published: string[] = [];
    for (const p of feeds) {
      // Feed stock is usually counted in KG: then the shop must sell by the kg
      // (minimum 50 = one bag), or a per-kg price would be charged per "50 kg bag".
      const inKg = /kg|kilo/i.test(`${p.uom?.name ?? ""} ${p.uom?.code ?? ""} ${p.uom?.symbol ?? ""}`);
      await this.prisma.product.update({
        where: { id: p.id },
        data: {
          isPublic: true,
          publicSlug: p.publicSlug ?? (await this.uniqueSlug(companyId, p.name, p.id)),
          storefrontCategory: p.storefrontCategory ?? "Feed",
          unitLabel: p.unitLabel ?? (inKg ? "kg" : "50 kg bag"),
          ...(inKg && (p.minOrderQty == null || Number(p.minOrderQty) <= 1) ? { minOrderQty: 50 } : {}),
        },
      });
      published.push(p.name);
    }
    return { data: { published: published.length, names: published } };
  }

  private async uniqueSlug(companyId: string, name: string, productId: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 150) || "product";
    let candidate = base;
    for (let n = 2; n < 50; n++) {
      const clash = await this.prisma.product.findFirst({ where: { companyId, publicSlug: candidate, NOT: { id: productId } }, select: { id: true } });
      if (!clash) return candidate;
      candidate = `${base}-${n}`;
    }
    return `${base}-${productId.slice(0, 6)}`;
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

    // M-BUG: this response used to include the customer's full name and
    // delivery address for anyone holding a valid order reference — the
    // order-status page never reads or renders either field. Access is
    // gated only by possession of an unguessable reference (fine today),
    // but returning more PII than the page needs means any future leak of
    // that one reference exposes a full name and address, not just status.
    return {
      storefrontRef: ref,
      orderNumber:   order.orderNumber,
      status:        order.status,
      statusLabel:   statusLabel[order.status] ?? order.status,
      createdAt:     order.orderDate,
      total:         Number(order.totalAmount),
      lines: order.items.map((i) => ({
        productName: (i.product as { name: string; unitLabel?: string | null }).name,
        qty:         Number(i.quantity),
        unitPrice:   Number(i.unitPrice),
      })),
    };
  }
}
