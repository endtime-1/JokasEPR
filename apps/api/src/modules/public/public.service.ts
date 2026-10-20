import { BadRequestException, HttpException, HttpStatus, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../notifications/email.service";
import { PlacePublicOrderDto } from "./dto/public-order.dto";
import { PublicContactDto } from "./dto/public-contact.dto";
import { RetailerApplicationDto } from "./dto/retailer-application.dto";
import { PublicJobApplicationDto } from "./dto/public-job-application.dto";
import { nextRef } from "../../common/next-ref";
import { UpdatePublicProductDto } from "./dto/update-public-product.dto";
import { randomBytes } from "crypto";

// The shop reads prices from the product's price lists, but must never touch the
// ones Sales uses. Its OWN price is a list named "Storefront Price" (for everyone: no
// customer group, no branch). A price of 0 on that row means "no online price": the
// feed becomes request-only and the shop does NOT fall back to a Sales price.
// Without a Storefront row it falls back to the newest general (all customers, all
// branches, currently valid) price list, never a customer-group or branch price.
const STOREFRONT_PRICE_NAME = "Storefront Price";
const SHOP_PRICE_SELECT = { id: true, name: true, unitPrice: true, customerGroupId: true, branchId: true, validFrom: true, validTo: true } as const;
type ShopPriceRow = { name?: string; unitPrice: unknown; customerGroupId?: string | null; branchId?: string | null; validFrom?: Date | null; validTo?: Date | null };

function pickShopPrice(rows: ShopPriceRow[]): number | null {
  const now = new Date();
  const live = rows.filter((r) => !r.customerGroupId && !r.branchId && (!r.validFrom || r.validFrom <= now) && (!r.validTo || r.validTo > now));
  const row = live.find((r) => r.name === STOREFRONT_PRICE_NAME) ?? live[0];
  const price = row ? Number(row.unitPrice) : 0;
  return price > 0 ? price : null;
}

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
    await this.assertLeadNotSpam(companyId, dto.phone);
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
    await this.assertLeadNotSpam(companyId, dto.phone);
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

  // ── Careers ────────────────────────────────────────────────────────────────

  private openJobWhere(companyId: string) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return { companyId, deletedAt: null, status: "OPEN", OR: [{ closingDate: null }, { closingDate: { gte: today } }] };
  }

  private toPublicJob(j: { reference: string; title: string; department: string | null; location: string | null; employmentType: string | null; description: string; requirements: string | null; closingDate: Date | null; createdAt: Date }) {
    return {
      reference: j.reference, title: j.title, department: j.department, location: j.location, employmentType: j.employmentType,
      description: j.description, requirements: j.requirements, closingDate: j.closingDate, postedAt: j.createdAt,
    };
  }

  async listOpenJobs() {
    const companyId = await this.getStorefrontCompanyId();
    const rows = await this.prisma.jobPosting.findMany({ where: this.openJobWhere(companyId), orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((r) => this.toPublicJob(r));
  }

  async getOpenJob(ref: string) {
    const companyId = await this.getStorefrontCompanyId();
    const row = await this.prisma.jobPosting.findFirst({ where: { ...this.openJobWhere(companyId), reference: ref.trim().toUpperCase() } });
    if (!row) throw new NotFoundException("This job is no longer open.");
    return this.toPublicJob(row);
  }

  // The application goes straight into HR > Recruitment (status RECEIVED), and HR is emailed.
  async applyForJob(ref: string, dto: PublicJobApplicationDto, cvFilename?: string) {
    const companyId = await this.getStorefrontCompanyId();
    const job = await this.prisma.jobPosting.findFirst({ where: { ...this.openJobWhere(companyId), reference: ref.trim().toUpperCase() } });
    if (!job) throw new NotFoundException("This job is no longer open.");

    const hourAgo = new Date(Date.now() - 3600_000);
    const recent = await this.prisma.jobApplication.count({ where: { companyId, source: "ONLINE", applicantPhone: dto.phone, createdAt: { gte: hourAgo } } });
    if (recent >= 5) throw new HttpException("Too many applications from this phone number. Please try again later.", HttpStatus.TOO_MANY_REQUESTS);
    const dup = await this.prisma.jobApplication.findFirst({ where: { companyId, jobPostingId: job.id, deletedAt: null, applicantPhone: dto.phone } });
    if (dup) throw new BadRequestException(`We already have an application for this job from ${dto.phone} (reference ${dup.reference}). We will be in touch.`);

    let dateOfBirth: Date | undefined;
    if (dto.dateOfBirth) {
      const d = new Date(dto.dateOfBirth);
      if (Number.isNaN(d.getTime()) || d > new Date()) throw new BadRequestException("Please enter a valid date of birth.");
      dateOfBirth = d;
    }
    const reference = await nextRef(this.prisma, companyId, "APP");
    const name = `${dto.firstName.trim()} ${dto.lastName.trim()}`;
    const row = await this.prisma.jobApplication.create({
      data: {
        companyId, jobPostingId: job.id, reference, source: "ONLINE", applicantName: name,
        applicantEmail: dto.email, applicantPhone: dto.phone, gender: dto.gender, dateOfBirth, address: dto.address,
        education: dto.education, yearsExperience: dto.yearsExperience, currentEmployer: dto.currentEmployer,
        expectedSalary: dto.expectedSalary, availability: dto.availability, coverLetter: dto.coverLetter,
        resumeUrl: cvFilename ? `/api/v1/uploads/cv/${cvFilename}` : undefined,
      },
    });
    const html = `
      <p><b>New job application (akokofeeds.com)</b></p>
      <p><b>Job:</b> ${escapeHtml(job.title)} (${escapeHtml(job.reference)})<br/>
      <b>Applicant:</b> ${escapeHtml(name)}<br/>
      <b>Phone:</b> ${escapeHtml(dto.phone)}<br/>
      ${dto.email ? `<b>Email:</b> ${escapeHtml(dto.email)}<br/>` : ""}
      <b>Reference:</b> ${escapeHtml(reference)}</p>
      <p>Open it in the ERP under HR, then Recruitment.</p>`;
    await this.notify(this.config.get<string>("HR_EMAIL", this.config.get<string>("SALES_COPY_EMAIL", "akokofeeds@gmail.com")), `Job application: ${name} - ${job.title}`, html, row.id);
    return { reference, jobTitle: job.title };
  }

  // One phone number can send only a few enquiries an hour (a bot rotating IPs still hits this).
  private async assertLeadNotSpam(companyId: string, phone: string) {
    const recent = await this.prisma.storefrontLead.count({ where: { companyId, phone, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    if (recent >= 5) throw new HttpException("Too many messages from this phone number. Please call or WhatsApp us on 050 545 5055.", HttpStatus.TOO_MANY_REQUESTS);
  }

  // Best-effort email: the lead is already saved, so a mail failure is logged,
  // never shown to the visitor as an error.
  private async notify(to: string, subject: string, html: string, leadId: string, copyTo?: string) {
    await Promise.all([to, copyTo].filter((a): a is string => !!a).map(async (address) => {
      const ok = await this.email.send(address, subject, html).catch(() => false);
      if (!ok) this.logger.error(`Lead ${leadId}: notification email to ${address} failed (SMTP not configured?). The lead is saved in the database.`);
    }));
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
          where: { status: "ACTIVE", deletedAt: null },
          select: SHOP_PRICE_SELECT,
          orderBy: { validFrom: "desc" },
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
      unitPrice: pickShopPrice(p.priceLists),
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
          where: { status: "ACTIVE", deletedAt: null },
          select: SHOP_PRICE_SELECT,
          orderBy: { validFrom: "desc" },
        },
      },
    });

    if (!p) throw new NotFoundException("Product not found");

    return {
      id: p.id, name: p.name, slug: p.publicSlug, description: p.publicDescription,
      imageUrl: p.publicImageUrl, category: p.storefrontCategory,
      minOrderQty: p.minOrderQty ? Number(p.minOrderQty) : 1,
      unitLabel: p.unitLabel ?? "unit",
      unitPrice: pickShopPrice(p.priceLists),
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
        branches:   { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, take: 1 },
        warehouses: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });

    if (!company || !company.branches[0] || !company.warehouses[0]) {
      throw new BadRequestException("Store configuration error. Please contact us directly.");
    }

    const branch    = company.branches[0];
    const warehouse = company.warehouses[0];

    // Anti-spam on top of the per-IP limit: one phone number can only place a few
    // orders an hour, however many IPs a bot rotates through.
    const recentByPhone = await this.prisma.salesOrder.count({
      where: { companyId: company.id, isStorefrontOrder: true, storefrontCustomerPhone: dto.customerPhone, createdAt: { gte: new Date(Date.now() - 3600_000) } },
    });
    if (recentByPhone >= 5) {
      throw new HttpException("Too many orders from this phone number. Please call or WhatsApp us on 050 545 5055.", HttpStatus.TOO_MANY_REQUESTS);
    }

    // Two lines for the same feed are one line (they used to fail as "unavailable").
    const merged = new Map<string, number>();
    for (const l of dto.lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
    const lines = [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
    if (lines.some((l) => l.quantity > 10000)) throw new BadRequestException("That quantity is too large for one order line. Please contact us for a bulk order.");

    const productIds = lines.map((l) => l.productId);
    const products   = await this.prisma.product.findMany({
      // Only products that are actually on sale: a deleted or deactivated product can't be ordered by ID.
      where: { id: { in: productIds }, isPublic: true, status: "ACTIVE", deletedAt: null, publicSlug: { not: null }, companyId: company.id },
      include: {
        priceLists: { where: { status: "ACTIVE", deletedAt: null }, orderBy: { validFrom: "desc" } },
      },
    });

    if (products.length !== lines.length) {
      throw new BadRequestException("One or more products are unavailable.");
    }

    const orderItems = lines.map((line) => {
      const product  = products.find((p) => p.id === line.productId)!;
      const unitPrice = pickShopPrice(product.priceLists) ?? 0;
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
          where: { status: "ACTIVE", deletedAt: null },
          select: SHOP_PRICE_SELECT,
          orderBy: { validFrom: "desc" },
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
      unitPrice: pickShopPrice(p.priceLists),
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

    // Editing or clearing the shop price only ever touches the shop's OWN price row
    // ("Storefront Price"), never the price lists Sales uses. Clearing sends 0 (or null):
    // that sets the shop row to 0, which means "no online price" and stops the shop
    // falling back to a Sales price, so a cleared price stays cleared.
    if (dto.unitPrice !== undefined) {
      const price = Number(dto.unitPrice ?? 0);
      const rows = await this.prisma.priceList.findMany({
        where: { productId: id, companyId, status: "ACTIVE", deletedAt: null },
        select: SHOP_PRICE_SELECT,
        orderBy: { validFrom: "desc" },
      });
      const effective = pickShopPrice(rows) ?? 0;
      if (price !== effective) {
        const own = rows.find((r) => r.name === STOREFRONT_PRICE_NAME && !r.customerGroupId && !r.branchId);
        if (own) {
          await this.prisma.priceList.update({ where: { id: own.id }, data: { unitPrice: price } });
        } else {
          await this.prisma.priceList.create({
            data: { companyId, productId: id, name: STOREFRONT_PRICE_NAME, unitPrice: price, currency: "GHS", status: "ACTIVE" },
          });
        }
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
