import { Injectable } from "@nestjs/common";
import type { Statement } from "./fin-statement.service";

export type PdfBusiness = {
  businessName: string;
  legalName: string | null;
  tin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  logoDataUrl: string | null;
  currency: string;
};

export type PdfInvoice = {
  number: string | null;
  displayStatus: string;
  issueDate: string;
  dueDate: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  paidAmount: string;
  creditedAmount: string;
  balanceDue: string;
  notes: string | null;
  terms: string | null;
  contact: { name: string; code: string; email: string | null; phone: string | null; tin: string | null; addressLine1: string | null; addressLine2: string | null; city: string | null; region: string | null };
  lines: { description: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string; lineNet: string; isCharge: boolean }[];
};

export type PdfReceipt = {
  number: string;
  receiptDate: string;
  amount: string;
  methodLabel: string;
  reference: string | null;
  notes: string | null;
  status: "POSTED" | "VOID";
  creditKept: string;
  customer: { name: string; email: string | null; phone: string | null; addressLine1: string | null; addressLine2: string | null; city: string | null; region: string | null };
  allocations: { invoiceNumber: string | null; amount: string }[];
};

type Doc = PDFKit.PDFDocument;

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

const nf = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (s: string | number) => nf.format(Number(s));

/** Decodes a PNG/JPEG data URL for pdfkit (it cannot draw WebP). */
function logoBuffer(dataUrl: string | null): Buffer | null {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl ?? "");
  return m ? Buffer.from(m[2], "base64") : null;
}

/** Renders finance documents as PDF with the business details and logo from Finance Settings. */
@Injectable()
export class FinPdfService {
  private async start(): Promise<{ doc: Doc; done: Promise<Buffer> }> {
    const { default: PDFDocument } = await import("pdfkit");
    const doc = new PDFDocument({ margin: 48, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
    return { doc, done };
  }

  private header(doc: Doc, b: PdfBusiness, title: string, rightLines: string[]) {
    const top = 44;
    let textX = 48;
    const logo = logoBuffer(b.logoDataUrl);
    if (logo) {
      try {
        doc.image(logo, 48, top, { fit: [120, 54] });
        textX = 180;
      } catch {
        /* a bad image must never stop the document from rendering */
      }
    }
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(14).text(b.businessName || "Business", textX, top, { width: 260 });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
    const addr = [b.addressLine1, b.addressLine2, [b.city, b.region].filter(Boolean).join(", "), b.country].filter(Boolean).join(", ");
    if (addr) doc.text(addr, textX, doc.y, { width: 260 });
    if (b.tin) doc.text(`TIN: ${b.tin}`, textX, doc.y, { width: 260 });
    const contact = [b.phone, b.email].filter(Boolean).join("  ·  ");
    if (contact) doc.text(contact, textX, doc.y, { width: 260 });

    doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text(title, 340, top, { width: 207, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    for (const l of rightLines) doc.text(l, 340, doc.y, { width: 207, align: "right" });
    doc.y = Math.max(doc.y, 130) + 6;
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor(LINE).lineWidth(1).stroke();
    doc.y += 12;
    doc.fillColor(INK);
  }

  async invoice(b: PdfBusiness, inv: PdfInvoice): Promise<Buffer> {
    const { doc, done } = await this.start();
    const cur = b.currency || "GHS";
    this.header(doc, b, inv.displayStatus === "DRAFT" ? "DRAFT INVOICE" : "INVOICE", [
      inv.number ? `No. ${inv.number}` : "Not yet issued", `Date: ${inv.issueDate}`, `Due: ${inv.dueDate}`
    ]);

    // Bill to
    const c = inv.contact;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text("BILL TO", 48, doc.y);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(c.name, 48, doc.y + 2);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    for (const l of [c.addressLine1, c.addressLine2, [c.city, c.region].filter(Boolean).join(", "), c.phone, c.email, c.tin ? `TIN: ${c.tin}` : null]) if (l) doc.text(l, 48, doc.y);
    doc.y += 12;

    // Lines
    const cols = { desc: 48, qty: 300, price: 345, disc: 410, tax: 450, amt: 490 };
    const drawHead = () => {
      const y = doc.y;
      doc.rect(48, y - 3, 499, 17).fill("#f3f4f6");
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8);
      doc.text("DESCRIPTION", cols.desc + 4, y + 1, { width: 240 });
      doc.text("QTY", cols.qty, y + 1, { width: 40, align: "right" });
      doc.text("PRICE", cols.price, y + 1, { width: 60, align: "right" });
      doc.text("DISC %", cols.disc, y + 1, { width: 35, align: "right" });
      doc.text("TAX %", cols.tax, y + 1, { width: 35, align: "right" });
      doc.text(`AMOUNT (${cur})`, cols.amt - 18, y + 1, { width: 75, align: "right" });
      doc.y = y + 20;
      doc.fillColor(INK).font("Helvetica").fontSize(9);
    };
    drawHead();
    for (const l of inv.lines) {
      if (doc.y > 720) {
        doc.addPage();
        doc.y = 48;
        drawHead();
      }
      const y = doc.y;
      const h = doc.heightOfString(l.description, { width: 244 });
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(l.description + (l.isCharge ? " (charge)" : ""), cols.desc + 4, y, { width: 244 });
      doc.text(num(l.quantity).replace(/\.00$/, ""), cols.qty, y, { width: 40, align: "right" });
      doc.text(num(l.unitPrice), cols.price, y, { width: 60, align: "right" });
      doc.text(Number(l.discountPercent) ? num(l.discountPercent) : "", cols.disc, y, { width: 35, align: "right" });
      doc.text(Number(l.taxRatePercent) ? String(Number(l.taxRatePercent)) : "", cols.tax, y, { width: 35, align: "right" });
      doc.text(num(l.lineNet), cols.amt - 18, y, { width: 75, align: "right" });
      doc.y = y + Math.max(h, 12) + 5;
      doc.moveTo(48, doc.y - 2).lineTo(547, doc.y - 2).strokeColor(LINE).lineWidth(0.5).stroke();
    }

    // Totals
    if (doc.y > 650) {
      doc.addPage();
      doc.y = 48;
    }
    doc.y += 8;
    const row = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9.5).fillColor(INK);
      doc.text(label, 340, y, { width: 110, align: "right" });
      doc.text(value, 455, y, { width: 92, align: "right" });
      doc.y = y + (bold ? 17 : 14);
    };
    row("Subtotal", num(inv.subtotal));
    if (Number(inv.discountTotal)) row("Discount", `- ${num(inv.discountTotal)}`);
    if (Number(inv.taxTotal)) row("Tax", num(inv.taxTotal));
    row(`Total ${cur}`, num(inv.total), true);
    if (Number(inv.paidAmount)) row("Paid", `- ${num(inv.paidAmount)}`);
    if (Number(inv.creditedAmount)) row("Credits", `- ${num(inv.creditedAmount)}`);
    if (inv.displayStatus !== "DRAFT") row("Balance due", num(inv.balanceDue), true);

    if (inv.notes) {
      doc.y += 10;
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text("NOTES", 48, doc.y);
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(inv.notes, 48, doc.y + 2, { width: 499 });
    }
    if (inv.terms) {
      doc.y += 8;
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text("TERMS", 48, doc.y);
      doc.font("Helvetica").fontSize(9).fillColor(INK).text(inv.terms, 48, doc.y + 2, { width: 499 });
    }

    // A large stamp for paid and void documents.
    if (inv.displayStatus === "PAID" || inv.displayStatus === "VOID") {
      const pages = doc.bufferedPageRange();
      doc.switchToPage(pages.start);
      doc.save().rotate(-25, { origin: [300, 400] }).font("Helvetica-Bold").fontSize(64).fillColor(inv.displayStatus === "PAID" ? "#16a34a" : "#dc2626").fillOpacity(0.15);
      doc.text(inv.displayStatus, 150, 360, { width: 300, align: "center" });
      doc.restore();
    }
    this.footer(doc);
    doc.end();
    return done;
  }

  async statement(b: PdfBusiness, s: Statement): Promise<Buffer> {
    const { doc, done } = await this.start();
    const cur = b.currency || "GHS";
    this.header(doc, b, "STATEMENT", [`${s.from} to ${s.to}`, `Customer ${s.contact.code}`]);

    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text("CUSTOMER", 48, doc.y);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(s.contact.name, 48, doc.y + 2);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    for (const l of [...s.contact.address, s.contact.phone, s.contact.email]) if (l) doc.text(l, 48, doc.y);
    doc.y += 12;

    const cols = { date: 48, type: 106, ref: 180, desc: 250, debit: 380, credit: 445, bal: 490 };
    const head = () => {
      const y = doc.y;
      doc.rect(48, y - 3, 499, 17).fill("#f3f4f6");
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8);
      doc.text("DATE", cols.date + 4, y + 1);
      doc.text("TYPE", cols.type, y + 1);
      doc.text("REFERENCE", cols.ref, y + 1);
      doc.text("DETAILS", cols.desc, y + 1);
      doc.text("CHARGES", cols.debit, y + 1, { width: 60, align: "right" });
      doc.text("PAYMENTS", cols.credit, y + 1, { width: 45, align: "right" });
      doc.text("BALANCE", cols.bal - 2, y + 1, { width: 59, align: "right" });
      doc.y = y + 20;
      doc.fillColor(INK).font("Helvetica").fontSize(8.5);
    };
    head();
    const opening = doc.y;
    doc.font("Helvetica-Oblique").text("Opening balance", cols.date + 4, opening);
    doc.font("Helvetica").text(num(s.openingBalance), cols.bal - 2, opening, { width: 59, align: "right" });
    doc.y = opening + 16;
    const typeLabel: Record<string, string> = { INVOICE: "Invoice", RECEIPT: "Payment", CREDIT_NOTE: "Credit", DEPOSIT_APPLIED: "Deposit" };
    for (const r of s.rows) {
      if (doc.y > 735) {
        doc.addPage();
        doc.y = 48;
        head();
      }
      const y = doc.y;
      doc.fillColor(INK).font("Helvetica").fontSize(8.5);
      doc.text(r.date, cols.date + 4, y, { width: 54 });
      doc.text(typeLabel[r.type] ?? r.type, cols.type, y, { width: 70 });
      doc.text(r.reference, cols.ref, y, { width: 68 });
      doc.text(r.description, cols.desc, y, { width: 126 });
      if (r.debit) doc.text(num(r.debit), cols.debit, y, { width: 60, align: "right" });
      if (r.credit) doc.text(num(r.credit), cols.credit, y, { width: 45, align: "right" });
      doc.text(num(r.balance), cols.bal - 2, y, { width: 59, align: "right" });
      const h = doc.heightOfString(r.description, { width: 126 });
      doc.y = y + Math.max(h, 11) + 4;
      doc.moveTo(48, doc.y - 2).lineTo(547, doc.y - 2).strokeColor(LINE).lineWidth(0.4).stroke();
    }
    if (s.rows.length === 0) doc.font("Helvetica-Oblique").fillColor(MUTED).text("No activity in this period.", cols.date + 4, doc.y + 4);

    doc.y += 14;
    const row = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9.5).fillColor(INK);
      doc.text(label, 300, y, { width: 150, align: "right" });
      doc.text(value, 455, y, { width: 92, align: "right" });
      doc.y = y + (bold ? 17 : 14);
    };
    row("Total charges", num(s.totalDebits));
    row("Total payments and credits", num(s.totalCredits));
    row(`Balance due (${cur})`, num(s.closingBalance), true);
    if (Number(s.unappliedDeposits) > 0) row("Deposits held (not yet applied)", num(s.unappliedDeposits));
    this.footer(doc);
    doc.end();
    return done;
  }

  async receipt(b: PdfBusiness, r: PdfReceipt): Promise<Buffer> {
    const { doc, done } = await this.start();
    const cur = b.currency || "GHS";
    this.header(doc, b, "RECEIPT", [`No. ${r.number}`, `Date: ${r.receiptDate}`, r.status === "VOID" ? "VOID" : "Payment received"]);

    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text("RECEIVED FROM", 48, doc.y);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(r.customer.name, 48, doc.y + 2);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    for (const l of [r.customer.addressLine1, r.customer.addressLine2, [r.customer.city, r.customer.region].filter(Boolean).join(", "), r.customer.phone, r.customer.email]) if (l) doc.text(l, 48, doc.y);
    doc.y += 14;

    // Big amount box
    const y0 = doc.y;
    doc.roundedRect(48, y0, 499, 54, 6).fill("#f3f4f6");
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8.5).text("AMOUNT RECEIVED", 62, y0 + 10);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text(`${cur} ${num(r.amount)}`, 62, y0 + 23);
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(`${r.methodLabel}${r.reference ? `  ·  Ref: ${r.reference}` : ""}`, 300, y0 + 22, { width: 235, align: "right" });
    doc.y = y0 + 70;

    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text("APPLIED TO", 48, doc.y);
    doc.y += 4;
    const head = doc.y;
    doc.rect(48, head, 499, 17).fill("#f3f4f6");
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("INVOICE", 54, head + 5).text(`AMOUNT (${cur})`, 440, head + 5, { width: 100, align: "right" });
    doc.y = head + 22;
    doc.fillColor(INK).font("Helvetica").fontSize(9.5);
    for (const a of r.allocations) {
      const y = doc.y;
      doc.text(a.invoiceNumber ?? "Invoice", 54, y);
      doc.text(num(a.amount), 440, y, { width: 100, align: "right" });
      doc.y = y + 16;
      doc.moveTo(48, doc.y - 3).lineTo(547, doc.y - 3).strokeColor(LINE).lineWidth(0.4).stroke();
    }
    if (Number(r.creditKept) > 0) {
      const y = doc.y;
      doc.text("Kept as credit on your account", 54, y);
      doc.text(num(r.creditKept), 440, y, { width: 100, align: "right" });
      doc.y = y + 16;
    }
    if (r.allocations.length === 0 && Number(r.creditKept) === 0) doc.fillColor(MUTED).text("Payment on account", 54, doc.y);
    if (r.notes) {
      doc.y += 10;
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8.5).text("NOTES", 48, doc.y);
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(r.notes, 48, doc.y + 2, { width: 499 });
    }
    doc.y += 24;
    doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(9).text("Thank you for your payment.", 48, doc.y);

    if (r.status === "VOID") {
      doc.save().rotate(-25, { origin: [300, 400] }).font("Helvetica-Bold").fontSize(64).fillColor("#dc2626").fillOpacity(0.15);
      doc.text("VOID", 150, 360, { width: 300, align: "center" });
      doc.restore();
    }
    this.footer(doc);
    doc.end();
    return done;
  }

  private footer(doc: Doc) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).fillOpacity(1).text(`Page ${i + 1} of ${range.count}`, 48, 800, { width: 499, align: "center" });
    }
  }
}
