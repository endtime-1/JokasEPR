import { createHmac, timingSafeEqual } from "crypto";
import { Injectable, InternalServerErrorException } from "@nestjs/common";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Public links for invoices and statements. The token is  <id>.<HMAC>  where the HMAC is keyed with a server secret, so:
 *   - it cannot be guessed or forged (192-bit MAC),
 *   - nothing secret is stored in the database (a copy of the data does not contain working links),
 *   - an invoice link is revoked instantly by changing the invoice's linkVersion or switching its link off.
 * A wrong token of any kind just looks like "not found": callers must not reveal which part was wrong.
 */
@Injectable()
export class FinLinksService {
  private secret(): string {
    const s = process.env.FIN_LINK_SECRET || process.env.JWT_ACCESS_SECRET;
    if (!s || s.length < 16) throw new InternalServerErrorException("Public links are not configured on this server.");
    return s;
  }

  private mac(payload: string): string {
    return createHmac("sha256", this.secret()).update(payload).digest("base64url").slice(0, 32);
  }

  private same(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }

  invoiceToken(invoiceId: string, linkVersion: number): string {
    return `${invoiceId}.${this.mac(`inv:${invoiceId}:${linkVersion}`)}`;
  }

  /** Splits a token into its parts without trusting it; the caller must then call verifyInvoice(). */
  parseInvoiceToken(token: string): { invoiceId: string; mac: string } | null {
    const parts = (token ?? "").split(".");
    if (parts.length !== 2 || !UUID.test(parts[0]) || parts[1].length !== 32) return null;
    return { invoiceId: parts[0], mac: parts[1] };
  }

  verifyInvoice(parsed: { invoiceId: string; mac: string }, linkVersion: number): boolean {
    return this.same(parsed.mac, this.mac(`inv:${parsed.invoiceId}:${linkVersion}`));
  }

  statementToken(contactId: string, from: string, to: string): string {
    return `${contactId}.${from}.${to}.${this.mac(`st:${contactId}:${from}:${to}`)}`;
  }

  parseStatementToken(token: string): { contactId: string; from: string; to: string } | null {
    const parts = (token ?? "").split(".");
    if (parts.length !== 4 || !UUID.test(parts[0]) || !DAY.test(parts[1]) || !DAY.test(parts[2]) || parts[3].length !== 32) return null;
    return this.same(parts[3], this.mac(`st:${parts[0]}:${parts[1]}:${parts[2]}`)) ? { contactId: parts[0], from: parts[1], to: parts[2] } : null;
  }

  /** A receipt link is <receiptId>.<HMAC>. Receipts never change (they are only ever voided, which the page shows), so the link has no version. */
  receiptToken(receiptId: string): string {
    return `${receiptId}.${this.mac(`rct:${receiptId}`)}`;
  }

  parseReceiptToken(token: string): { receiptId: string } | null {
    const parts = (token ?? "").split(".");
    if (parts.length !== 2 || !UUID.test(parts[0]) || parts[1].length !== 32) return null;
    return this.same(parts[1], this.mac(`rct:${parts[0]}`)) ? { receiptId: parts[0] } : null;
  }

  receiptLink(receiptId: string): string {
    return `${this.baseUrl()}/p/receipt/${this.receiptToken(receiptId)}`;
  }

  baseUrl(): string {
    return (process.env.WEB_ORIGIN || "http://localhost:3000").replace(/\/+$/, "");
  }

  invoiceLink(invoiceId: string, linkVersion: number): string {
    return `${this.baseUrl()}/p/invoice/${this.invoiceToken(invoiceId, linkVersion)}`;
  }

  statementLink(contactId: string, from: string, to: string): string {
    return `${this.baseUrl()}/p/statement/${this.statementToken(contactId, from, to)}`;
  }

  /** A wa.me link that opens WhatsApp with the message ready. With the customer's number it goes straight to their chat. */
  whatsappUrl(phone: string | null | undefined, text: string): string {
    const digits = (phone ?? "").replace(/\D/g, "");
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }
}
