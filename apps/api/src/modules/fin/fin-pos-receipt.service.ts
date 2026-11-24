import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FinLinksService } from "./fin-links.service";
import { PdfBusiness } from "./fin-pdf.service";
import { FinPosService } from "./fin-pos.service";
import { FinSettingsService } from "./fin-settings.service";

type Sale = Awaited<ReturnType<FinPosService["getSale"]>>;

export type PosReceipt = {
  business: PdfBusiness;
  header: string | null;
  footer: string | null;
  sale: Sale;
};

const nf = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: string | number) => nf.format(Number(v));
const METHOD: Record<string, string> = { CASH: "Cash", MOMO: "MoMo", CARD: "Card" };

/**
 * The customer's copy of a till sale: a printable 80 mm receipt (PDF), a public link and a WhatsApp message.
 * Like invoices and receipts, the public link is derived from a server secret (nothing stored) and a bad link is always "not found".
 */
@Injectable()
export class FinPosReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pos: FinPosService,
    private readonly settings: FinSettingsService,
    private readonly links: FinLinksService
  ) {}

  async data(companyId: string, saleId: string): Promise<PosReceipt> {
    const [s, ps, sale] = await Promise.all([this.settings.get(companyId), this.pos.settings(companyId), this.pos.getSale(companyId, saleId)]);
    return {
      business: {
        businessName: s.businessName || "Your business", legalName: s.legalName, tin: s.tin, addressLine1: s.addressLine1, addressLine2: s.addressLine2, city: s.city, region: s.region,
        country: s.country, phone: s.phone, email: s.email, logoDataUrl: null, currency: s.currency
      },
      header: ps.receiptHeader,
      footer: ps.receiptFooter,
      sale
    };
  }

  async share(companyId: string, saleId: string, phone?: string) {
    const r = await this.data(companyId, saleId);
    const customer = r.sale.contactId ? await this.prisma.finContact.findFirst({ where: { id: r.sale.contactId, companyId }, select: { phone: true } }) : null;
    const to = (phone ?? "").trim() || customer?.phone || null;
    const link = this.links.posReceiptLink(saleId);
    const text = `Thank you for shopping at ${r.business.businessName}. Your receipt ${r.sale.number} for ${r.business.currency} ${r.sale.total}: ${link}`;
    return { link, phone: to, whatsappUrl: this.links.whatsappUrl(to, text) };
  }

  async pdf(companyId: string, saleId: string): Promise<{ buffer: Buffer; filename: string }> {
    const r = await this.data(companyId, saleId);
    return { buffer: await this.render(r), filename: `${r.sale.number}.pdf` };
  }

  /** Public page data. A bad or unknown token is always the same "not found". */
  async publicReceipt(token: string) {
    const parsed = this.links.parsePosReceiptToken(token);
    if (!parsed) throw new NotFoundException("This link is not valid.");
    const sale = await this.prisma.finPosSale.findFirst({ where: { id: parsed.saleId }, select: { id: true, companyId: true } });
    if (!sale) throw new NotFoundException("This link is not valid.");
    return this.data(sale.companyId, sale.id);
  }

  async publicPdf(token: string) {
    const parsed = this.links.parsePosReceiptToken(token);
    const sale = parsed ? await this.prisma.finPosSale.findFirst({ where: { id: parsed.saleId }, select: { id: true, companyId: true } }) : null;
    if (!sale) throw new NotFoundException("This link is not valid.");
    return this.pdf(sale.companyId, sale.id);
  }

  // ─── the 80 mm roll ─────────────────────────────────────────────────────────

  /** Drawn twice: once on a tall page to measure how long the receipt is, then on a page cut to exactly that length. */
  private async render(r: PosReceipt): Promise<Buffer> {
    const { default: PDFDocument } = await import("pdfkit");
    const WIDTH = 226.77; // 80 mm
    const draw = (height: number) => {
      const doc = new PDFDocument({ size: [WIDTH, height], margins: { top: 10, bottom: 10, left: 10, right: 10 }, info: { Title: r.sale.number } });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
      const w = WIDTH - 20;
      const cur = r.business.currency || "GHS";
      const center = (t: string, size = 8, bold = false) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(t, 10, doc.y, { width: w, align: "center" });
      const pair = (left: string, right: string, bold = false, size = 8.5) => {
        const y = doc.y;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(left, 10, y, { width: w - 70 });
        const after = doc.y;
        doc.text(right, 10 + w - 70, y, { width: 70, align: "right" });
        doc.y = Math.max(after, y + size + 2);
      };
      const rule = () => { doc.moveTo(10, doc.y + 2).lineTo(10 + w, doc.y + 2).dash(1, { space: 1.5 }).strokeColor("#444").lineWidth(0.5).stroke().undash(); doc.y += 6; };

      doc.fillColor("#111");
      center(r.business.businessName, 11, true);
      const addr = [r.business.addressLine1, r.business.addressLine2, [r.business.city, r.business.region].filter(Boolean).join(", ")].filter(Boolean).join(", ");
      if (addr) center(addr, 7);
      const contact = [r.business.phone, r.business.tin ? `TIN ${r.business.tin}` : ""].filter(Boolean).join("  ·  ");
      if (contact) center(contact, 7);
      if (r.header) { doc.y += 2; center(r.header, 7.5); }
      doc.y += 4;
      rule();
      const s = r.sale;
      pair(`Receipt ${s.number}`, s.saleDate, true, 8.5);
      pair(`Cashier: ${s.cashierName}`, new Date(s.createdAt).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }), false, 7.5);
      if (s.customerName) pair(`Customer: ${s.customerName}`, "", false, 7.5);
      rule();
      for (const l of s.lines) {
        doc.font("Helvetica").fontSize(8.5).text(l.description, 10, doc.y, { width: w });
        const qty = Number(l.quantity);
        pair(`  ${qty % 1 === 0 ? qty : l.quantity} x ${num(l.unitPrice)}${Number(l.discountAmount) > 0 ? `  (-${num(l.discountAmount)})` : ""}`, num(l.lineTotal), false, 8);
      }
      rule();
      if (Number(s.discountTotal) > 0) pair("Discounts", `-${num(s.discountTotal)}`);
      if (Number(s.taxTotal) > 0) {
        pair("Subtotal (before tax)", num(s.subtotal));
        pair("Tax included", num(s.taxTotal));
      }
      pair(`TOTAL ${cur}`, num(s.total), true, 11);
      doc.y += 2;
      for (const p of s.payments) pair(`${METHOD[p.method] ?? p.method}${p.reference ? ` (${p.reference})` : ""}`, num(p.method === "CASH" ? p.tendered : p.amount), false, 8);
      if (Number(s.changeGiven) > 0) pair("Change", num(s.changeGiven), true, 8.5);
      if (s.refunds.length > 0) {
        rule();
        for (const f of s.refunds) pair(`Refund ${f.number}`, `-${num(f.total)}`, false, 8);
      }
      rule();
      center(r.footer || "Thank you for shopping with us!", 8);
      doc.y += 6;
      const end = doc.y;
      doc.end();
      return { done, end };
    };
    const probe = draw(3000);
    await probe.done;
    const final = draw(Math.max(160, Math.ceil(probe.end + 14)));
    return final.done;
  }
}
