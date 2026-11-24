import { Body, Controller, Get, Header, Param, Post, StreamableFile } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import { CreateCheckoutDto } from "./dto/fin-banking.dto";
import { FinOnlinePaymentsService } from "./fin-online-payments.service";
import { FinPosReceiptService } from "./fin-pos-receipt.service";
import { FinSalesShareService } from "./fin-sales-share.service";

/**
 * The customer-facing pages: an invoice or statement opened from the link in an email or WhatsApp message.
 * No login. Access is the unguessable token alone; any bad token answers 404, whatever was wrong with it.
 * Tightly rate-limited so a token cannot be brute-forced, and never cached by browsers or proxies.
 */
@Public()
@Controller("fin/public")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class FinPublicController {
  constructor(private readonly share: FinSalesShareService, private readonly online: FinOnlinePaymentsService, private readonly posReceipts: FinPosReceiptService) {}

  @Get("invoices/:token")
  @Header("Cache-Control", "no-store")
  async invoice(@Param("token") token: string) {
    return { data: await this.share.publicInvoice(token) };
  }

  @Get("invoices/:token/pdf")
  @Header("Cache-Control", "no-store")
  async invoicePdf(@Param("token") token: string) {
    const r = await this.share.publicInvoicePdf(token);
    return new StreamableFile(r.buffer, { type: "application/pdf", disposition: `inline; filename="${r.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"` });
  }

  /** Whether the Pay now button should be shown. */
  @Get("online/config")
  @Header("Cache-Control", "no-store")
  onlineConfig() {
    return { data: { enabled: this.online.config().enabled } };
  }

  /** Starts a card / mobile money payment for the invoice (or part of it) and returns the provider page to send the customer to. */
  @Post("invoices/:token/pay")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  async pay(@Param("token") token: string, @Body() dto: CreateCheckoutDto) {
    return { data: await this.online.createCheckout(token, dto) };
  }

  /** What the page asks after the customer comes back from the provider. */
  @Get("invoices/:token/payments/:reference")
  @Header("Cache-Control", "no-store")
  async paymentStatus(@Param("token") token: string, @Param("reference") reference: string) {
    return { data: await this.online.checkStatus(token, reference) };
  }

  @Get("receipts/:token")
  @Header("Cache-Control", "no-store")
  async receipt(@Param("token") token: string) {
    return { data: await this.share.publicReceipt(token) };
  }

  @Get("receipts/:token/pdf")
  @Header("Cache-Control", "no-store")
  async receiptPdf(@Param("token") token: string) {
    const r = await this.share.publicReceiptPdf(token);
    return new StreamableFile(r.buffer, { type: "application/pdf", disposition: `inline; filename="${r.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"` });
  }

  @Get("pos-receipts/:token")
  @Header("Cache-Control", "no-store")
  async posReceipt(@Param("token") token: string) {
    return { data: await this.posReceipts.publicReceipt(token) };
  }

  @Get("pos-receipts/:token/pdf")
  @Header("Cache-Control", "no-store")
  async posReceiptPdf(@Param("token") token: string) {
    const r = await this.posReceipts.publicPdf(token);
    return new StreamableFile(r.buffer, { type: "application/pdf", disposition: `inline; filename="${r.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"` });
  }

  @Get("statements/:token")
  @Header("Cache-Control", "no-store")
  async statement(@Param("token") token: string) {
    return { data: await this.share.publicStatement(token) };
  }

  @Get("statements/:token/pdf")
  @Header("Cache-Control", "no-store")
  async statementPdf(@Param("token") token: string) {
    const r = await this.share.publicStatementPdf(token);
    return new StreamableFile(r.buffer, { type: "application/pdf", disposition: `inline; filename="${r.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"` });
  }
}
