import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../notifications/email.service";
import { SendEmailDto } from "./dto/fin-sales.dto";
import { FinAuditService, RequestMeta } from "./fin-audit.service";
import { FinInvoicesService } from "./fin-invoices.service";
import { FinLinksService } from "./fin-links.service";
import { FinPdfService, PdfBusiness, PdfInvoice, PdfReceipt } from "./fin-pdf.service";
import { FinSettingsService } from "./fin-settings.service";
import { FinStatementService } from "./fin-statement.service";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Everything about getting a document to the customer: PDF, email, WhatsApp text, and the public (no-login) view. */
@Injectable()
export class FinSalesShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly invoices: FinInvoicesService,
    private readonly statements: FinStatementService,
    private readonly settings: FinSettingsService,
    private readonly links: FinLinksService,
    private readonly pdf: FinPdfService,
    private readonly email: EmailService
  ) {}

  // ─── PDFs ───────────────────────────────────────────────────────────────────

  async invoicePdf(companyId: string, id: string) {
    const { business, doc } = await this.loadInvoice(companyId, id);
    return { buffer: await this.pdf.invoice(business, doc), filename: `${doc.number ?? "draft-invoice"}.pdf` };
  }

  async statementPdf(companyId: string, contactId: string, from: string, to: string) {
    const [business, statement] = await Promise.all([this.business(companyId), this.statements.build(companyId, contactId, from, to)]);
    return { buffer: await this.pdf.statement(business, statement), filename: `statement-${statement.contact.code}-${from}-to-${to}.pdf` };
  }

  // ─── share links and messages ───────────────────────────────────────────────

  async invoiceShare(companyId: string, id: string) {
    const inv = await this.invoices.get(companyId, id);
    if (inv.status === "DRAFT") throw new BadRequestException("Issue the invoice first. Drafts cannot be shared.");
    const business = await this.business(companyId);
    const link = this.links.invoiceLink(inv.id, inv.linkVersion);
    const text = `Hello ${inv.contact.name}, here is invoice ${inv.number} from ${business.businessName} for ${business.currency} ${inv.total}${inv.status === "SENT" && inv.balanceDue !== "0.00" ? ` (balance ${inv.balanceDue}, due ${inv.dueDate})` : ""}: ${link}`;
    return {
      enabled: inv.linkEnabled,
      link: inv.linkEnabled ? link : null,
      whatsappUrl: inv.linkEnabled ? this.links.whatsappUrl(inv.contact.phone, text) : null,
      email: inv.contact.email,
      phone: inv.contact.phone
    };
  }

  async statementShare(companyId: string, contactId: string, from: string, to: string) {
    const [business, statement] = await Promise.all([this.business(companyId), this.statements.build(companyId, contactId, from, to)]);
    const link = this.links.statementLink(contactId, statement.from, statement.to);
    const text = `Hello ${statement.contact.name}, your statement from ${business.businessName} (${statement.from} to ${statement.to}) shows a balance of ${business.currency} ${statement.closingBalance}: ${link}`;
    return { link, whatsappUrl: this.links.whatsappUrl(statement.contact.phone, text), email: statement.contact.email, phone: statement.contact.phone };
  }

  // ─── email ──────────────────────────────────────────────────────────────────

  async emailInvoice(companyId: string, userId: string, id: string, dto: SendEmailDto, meta: RequestMeta) {
    const { business, doc, invoice } = await this.loadInvoice(companyId, id);
    if (invoice.status === "DRAFT") throw new BadRequestException("Issue the invoice before emailing it.");
    const to = dto.to?.trim() || invoice.contact.email;
    if (!to) throw new BadRequestException("This customer has no email address. Enter one to send to.");
    const link = invoice.linkEnabled ? this.links.invoiceLink(invoice.id, invoice.linkVersion) : null;
    const buffer = await this.pdf.invoice(business, doc);
    const owing = Number(invoice.balanceDue) > 0 && invoice.status === "SENT";
    const html = `<p>Hello ${esc(invoice.contact.name)},</p>
<p>${dto.message ? esc(dto.message) : `Please find attached invoice <b>${esc(invoice.number ?? "")}</b> from ${esc(business.businessName)}.`}</p>
<p>Total: <b>${esc(business.currency)} ${esc(invoice.total)}</b>${owing ? ` &middot; Balance due: <b>${esc(business.currency)} ${esc(invoice.balanceDue)}</b> by ${esc(invoice.dueDate)}` : ""}</p>
${link ? `<p><a href="${esc(link)}">View or download the invoice online</a></p>` : ""}
<p>Thank you,<br>${esc(business.businessName)}</p>`;
    const ok = await this.email.sendWithAttachment(to, `Invoice ${invoice.number} from ${business.businessName}`, html, { filename: `${invoice.number}.pdf`, content: buffer });
    if (!ok) throw new BadRequestException("The email could not be sent. Check that email (SMTP) is set up on the server, then try again.");
    await this.audit.write({ companyId, userId, area: "sales", action: "EMAIL_INVOICE", entityType: "FinInvoice", entityId: id, summary: `Emailed ${invoice.number} to ${to}`, ...meta });
    return { sentTo: to };
  }

  async emailStatement(companyId: string, userId: string, contactId: string, from: string, to: string, dto: SendEmailDto, meta: RequestMeta) {
    const [business, statement] = await Promise.all([this.business(companyId), this.statements.build(companyId, contactId, from, to)]);
    const address = dto.to?.trim() || statement.contact.email;
    if (!address) throw new BadRequestException("This customer has no email address. Enter one to send to.");
    const buffer = await this.pdf.statement(business, statement);
    const link = this.links.statementLink(contactId, statement.from, statement.to);
    const html = `<p>Hello ${esc(statement.contact.name)},</p>
<p>${dto.message ? esc(dto.message) : `Please find attached your statement from ${esc(business.businessName)} for ${esc(statement.from)} to ${esc(statement.to)}.`}</p>
<p>Balance: <b>${esc(business.currency)} ${esc(statement.closingBalance)}</b></p>
<p><a href="${esc(link)}">View the statement online</a></p>
<p>Thank you,<br>${esc(business.businessName)}</p>`;
    const ok = await this.email.sendWithAttachment(address, `Statement from ${business.businessName}`, html, { filename: `statement-${statement.contact.code}.pdf`, content: buffer });
    if (!ok) throw new BadRequestException("The email could not be sent. Check that email (SMTP) is set up on the server, then try again.");
    await this.audit.write({ companyId, userId, area: "sales", action: "EMAIL_STATEMENT", entityType: "FinContact", entityId: contactId, summary: `Emailed a statement (${statement.from} to ${statement.to}) to ${address}`, ...meta });
    return { sentTo: address };
  }

  // ─── public (no login) ──────────────────────────────────────────────────────

  /** Resolves an invoice token. Any failure, whatever the cause, is the same "not found" so a wrong token reveals nothing. */
  private async resolveInvoiceToken(token: string) {
    const parsed = this.links.parseInvoiceToken(token);
    if (!parsed) throw new NotFoundException("This link is not valid.");
    const inv = await this.prisma.finInvoice.findFirst({ where: { id: parsed.invoiceId } });
    if (!inv || inv.status === "DRAFT" || !inv.linkEnabled || !this.links.verifyInvoice(parsed, inv.linkVersion)) throw new NotFoundException("This link is not valid.");
    return inv;
  }

  async publicInvoice(token: string) {
    const raw = await this.resolveInvoiceToken(token);
    const { business, doc } = await this.loadInvoice(raw.companyId, raw.id);
    return { business: { ...business }, invoice: doc };
  }

  async publicInvoicePdf(token: string) {
    const raw = await this.resolveInvoiceToken(token);
    return this.invoicePdf(raw.companyId, raw.id);
  }

  private async resolveStatementToken(token: string) {
    const parsed = this.links.parseStatementToken(token);
    if (!parsed) throw new NotFoundException("This link is not valid.");
    const contact = await this.prisma.finContact.findFirst({ where: { id: parsed.contactId } });
    if (!contact) throw new NotFoundException("This link is not valid.");
    return { ...parsed, companyId: contact.companyId };
  }

  async publicStatement(token: string) {
    const t = await this.resolveStatementToken(token);
    const [business, statement] = await Promise.all([this.business(t.companyId), this.statements.build(t.companyId, t.contactId, t.from, t.to)]);
    return { business, statement };
  }

  async publicStatementPdf(token: string) {
    const t = await this.resolveStatementToken(token);
    return this.statementPdf(t.companyId, t.contactId, t.from, t.to);
  }

  // ─── receipts ───────────────────────────────────────────────────────────────

  async receiptPdf(companyId: string, id: string) {
    const { business, doc } = await this.loadReceipt(companyId, id);
    return { buffer: await this.pdf.receipt(business, doc), filename: `${doc.number}.pdf` };
  }

  async receiptShare(companyId: string, id: string) {
    const { business, doc, phone, email } = await this.loadReceipt(companyId, id);
    const link = this.links.receiptLink(id);
    const text = `Hello ${doc.customer.name}, thank you for your payment. Here is your receipt ${doc.number} for ${business.currency} ${doc.amount} from ${business.businessName}: ${link}`;
    return { link, whatsappUrl: this.links.whatsappUrl(phone, text), email, phone };
  }

  async emailReceipt(companyId: string, userId: string, id: string, dto: SendEmailDto, meta: RequestMeta) {
    const { business, doc, email } = await this.loadReceipt(companyId, id);
    const to = dto.to?.trim() || email;
    if (!to) throw new BadRequestException("This customer has no email address. Enter one to send to.");
    const link = this.links.receiptLink(id);
    const html = `<p>Hello ${esc(doc.customer.name)},</p><p>${dto.message ? esc(dto.message) : `Thank you for your payment. Your receipt <b>${esc(doc.number)}</b> for <b>${esc(business.currency)} ${esc(doc.amount)}</b> is attached.`}</p><p><a href="${esc(link)}">View the receipt online</a></p><p>${esc(business.businessName)}</p>`;
    const ok = await this.email.sendWithAttachment(to, `Receipt ${doc.number} from ${business.businessName}`, html, { filename: `${doc.number}.pdf`, content: await this.pdf.receipt(business, doc) });
    if (!ok) throw new BadRequestException("The email could not be sent. Check that email (SMTP) is set up on the server, then try again.");
    await this.audit.write({ companyId, userId, area: "sales", action: "EMAIL_RECEIPT", entityType: "FinReceipt", entityId: id, summary: `Emailed receipt ${doc.number} to ${to}`, ...meta });
    return { sentTo: to };
  }

  /** Public receipt page data. A bad or unknown token is always the same "not found". */
  async publicReceipt(token: string) {
    const parsed = this.links.parseReceiptToken(token);
    if (!parsed) throw new NotFoundException("This link is not valid.");
    const r = await this.prisma.finReceipt.findFirst({ where: { id: parsed.receiptId } });
    if (!r) throw new NotFoundException("This link is not valid.");
    const { business, doc } = await this.loadReceipt(r.companyId, r.id);
    return { business, receipt: doc };
  }

  async publicReceiptPdf(token: string) {
    const parsed = this.links.parseReceiptToken(token);
    const r = parsed ? await this.prisma.finReceipt.findFirst({ where: { id: parsed.receiptId } }) : null;
    if (!r) throw new NotFoundException("This link is not valid.");
    return this.receiptPdf(r.companyId, r.id);
  }

  private async loadReceipt(companyId: string, id: string) {
    const [business, r] = await Promise.all([
      this.business(companyId),
      this.prisma.finReceipt.findFirst({ where: { id, companyId }, include: { contact: true, allocations: { include: { invoice: { select: { number: true } } } } } })
    ]);
    if (!r) throw new NotFoundException("Receipt not found.");
    const excess = await this.prisma.finCustomerDeposit.findFirst({ where: { sourceReceiptId: id, companyId }, select: { amount: true } });
    const labels: Record<string, string> = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", MOBILE_MONEY: "Mobile money", CHEQUE: "Cheque", CARD: "Card" };
    const doc: PdfReceipt = {
      number: r.number, receiptDate: r.receiptDate.toISOString().slice(0, 10), amount: Number(r.amount).toFixed(2), methodLabel: labels[r.method] ?? r.method, reference: r.reference, notes: r.notes,
      status: r.status, creditKept: excess ? Number(excess.amount).toFixed(2) : "0.00",
      customer: { name: r.contact.name, email: r.contact.email, phone: r.contact.phone, addressLine1: r.contact.addressLine1, addressLine2: r.contact.addressLine2, city: r.contact.city, region: r.contact.region },
      allocations: r.allocations.map((a) => ({ invoiceNumber: a.invoice.number, amount: Number(a.amount).toFixed(2) }))
    };
    return { business, doc, phone: r.contact.phone, email: r.contact.email };
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  private async business(companyId: string): Promise<PdfBusiness> {
    const s = await this.settings.get(companyId);
    return {
      businessName: s.businessName || "Your business", legalName: s.legalName, tin: s.tin, addressLine1: s.addressLine1, addressLine2: s.addressLine2, city: s.city, region: s.region,
      country: s.country, phone: s.phone, email: s.email, logoDataUrl: s.logoDataUrl, currency: s.currency
    };
  }

  private async loadInvoice(companyId: string, id: string) {
    const [business, invoice] = await Promise.all([this.business(companyId), this.invoices.get(companyId, id)]);
    const doc: PdfInvoice = {
      number: invoice.number, displayStatus: invoice.displayStatus, issueDate: invoice.issueDate, dueDate: invoice.dueDate, subtotal: invoice.subtotal, discountTotal: invoice.discountTotal,
      taxTotal: invoice.taxTotal, total: invoice.total, paidAmount: invoice.paidAmount, creditedAmount: invoice.creditedAmount, balanceDue: invoice.balanceDue, notes: invoice.notes, terms: invoice.terms,
      contact: { name: invoice.contact.name, code: invoice.contact.code, email: invoice.contact.email, phone: invoice.contact.phone, tin: invoice.contact.tin, addressLine1: invoice.contact.addressLine1, addressLine2: invoice.contact.addressLine2, city: invoice.contact.city, region: invoice.contact.region },
      lines: invoice.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, taxRatePercent: l.taxRatePercent, lineNet: l.lineNet, isCharge: l.isCharge }))
    };
    return { business, invoice, doc };
  }
}
