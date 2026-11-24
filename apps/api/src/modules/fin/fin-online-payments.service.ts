import { randomBytes } from "crypto";
import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCheckoutDto } from "./dto/fin-banking.dto";
import { FinAuditService } from "./fin-audit.service";
import { FinCustomerPaymentsService } from "./fin-customer-payments.service";
import { FinLedgerService, dayString, parseDay } from "./fin-ledger.service";
import { FinLinksService } from "./fin-links.service";
import { decimalToPesewas, pesewasToDecimal, toPesewas } from "./fin-money";
import { PaymentProvider, PaystackProvider } from "./fin-payment-provider";

const SYSTEM_USER = "online-payment";
const MIN_PESEWAS = 100; // GHS 1.00

/** Holds the available providers. Add another provider here to support it; nothing else changes. */
@Injectable()
export class FinPaymentProviders {
  private readonly map = new Map<string, PaymentProvider>([["paystack", new PaystackProvider()]]);

  register(p: PaymentProvider) {
    this.map.set(p.name, p);
  }

  /** The provider chosen in .env (ONLINE_PAYMENT_PROVIDER, default "paystack"). */
  active(): PaymentProvider {
    const name = process.env.ONLINE_PAYMENT_PROVIDER || "paystack";
    const p = this.map.get(name);
    if (!p) throw new BadRequestException(`The online payment provider "${name}" is not supported.`);
    return p;
  }
}

export type ProcessOutcome = { status: "PAID" | "ALREADY_PAID" | "FAILED" | "PENDING" | "REVIEW" | "UNKNOWN"; receiptId?: string; reason?: string };

/**
 * "Pay now" on an invoice: card and mobile money through a payment provider.
 *
 *  1. The customer opens the public invoice and presses Pay now: we record a PENDING checkout (unique reference) and send them to the provider.
 *  2. The provider tells us it was paid, by webhook. The signature is checked against the raw bytes, and then the provider is asked directly
 *     (verify) what happened, so a forged or edited webhook can never create money.
 *  3. Exactly once, inside one database transaction: the receipt is posted and the checkout is marked PAID.
 *
 * Idempotent by construction: the checkout row is locked, a PAID row is returned untouched, and the database refuses any change to a PAID row.
 * A webhook delivered twice, or twice at the same moment, posts one receipt.
 */
@Injectable()
export class FinOnlinePaymentsService {
  private readonly logger = new Logger(FinOnlinePaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly providers: FinPaymentProviders,
    private readonly payments: FinCustomerPaymentsService,
    private readonly ledger: FinLedgerService,
    private readonly links: FinLinksService
  ) {}

  /** Whether the Pay now button should be shown at all. */
  config() {
    try {
      const p = this.providers.active();
      return { enabled: p.isConfigured(), provider: p.name };
    } catch {
      return { enabled: false, provider: null };
    }
  }

  // ─── starting a payment (public) ────────────────────────────────────────────

  async createCheckout(token: string, dto: CreateCheckoutDto) {
    const provider = this.providers.active();
    if (!provider.isConfigured()) throw new BadRequestException("Online payment is not available.");
    const parsed = this.links.parseInvoiceToken(token);
    const inv = parsed ? await this.prisma.finInvoice.findFirst({ where: { id: parsed.invoiceId }, include: { contact: true } }) : null;
    if (!parsed || !inv || inv.status === "DRAFT" || !inv.linkEnabled || !this.links.verifyInvoice(parsed, inv.linkVersion)) throw new NotFoundException("This link is not valid.");
    if (inv.status !== "SENT" || decimalToPesewas(inv.balanceDue) <= 0) throw new BadRequestException("This invoice has nothing left to pay.");

    const balance = decimalToPesewas(inv.balanceDue);
    const amount = dto.amount === undefined || dto.amount === null || dto.amount === "" ? balance : toPesewas(dto.amount, "The amount");
    if (amount < MIN_PESEWAS) throw new BadRequestException("The smallest payment is GHS 1.00.");
    if (amount > balance) throw new BadRequestException(`That is more than the invoice still owes (${pesewasToDecimal(balance)}).`);
    const email = dto.email?.trim() || inv.contact.email;
    if (!email) throw new BadRequestException("Please enter your email address so the payment provider can send you a receipt.");

    const recent = await this.prisma.finOnlinePayment.count({ where: { invoiceId: inv.id, status: "PENDING", createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
    if (recent >= 5) throw new BadRequestException("Too many payment attempts. Please wait a few minutes and try again.");

    const reference = `fin-${randomBytes(12).toString("hex")}`;
    const row = await this.prisma.finOnlinePayment.create({
      data: { companyId: inv.companyId, provider: provider.name, reference, invoiceId: inv.id, contactId: inv.contactId, amount: pesewasToDecimal(amount), customerEmail: email.slice(0, 160) }
    });
    try {
      const out = await provider.initialize({
        reference, amountPesewas: amount, email, currency: inv.currency || "GHS", callbackUrl: `${this.links.baseUrl()}/p/invoice/${token}?online=${reference}`,
        metadata: { invoice: inv.number ?? "", invoiceId: inv.id }
      });
      await this.prisma.finOnlinePayment.update({ where: { id: row.id }, data: { checkoutUrl: out.url.slice(0, 500), providerReference: out.providerReference } });
      return { url: out.url, reference };
    } catch (err) {
      await this.prisma.finOnlinePayment.update({ where: { id: row.id }, data: { status: "FAILED", failureReason: (err instanceof Error ? err.message : "Could not start the payment").slice(0, 300) } }).catch(() => undefined);
      throw err;
    }
  }

  /** What the customer's page polls after returning from the provider. Also catches up if the webhook is slow. */
  async checkStatus(token: string, reference: string) {
    const parsed = this.links.parseInvoiceToken(token);
    if (!parsed) throw new NotFoundException("This link is not valid.");
    const row = await this.prisma.finOnlinePayment.findFirst({ where: { invoiceId: parsed.invoiceId, reference } });
    if (!row) throw new NotFoundException("This link is not valid.");
    let status = row.status as string;
    if (row.status === "PENDING") {
      try {
        status = (await this.processReference(reference)).status;
      } catch (err) {
        this.logger.warn(`Status check for ${reference} could not complete: ${err instanceof Error ? err.message : err}`);
      }
    }
    return { status: status === "ALREADY_PAID" ? "PAID" : status === "UNKNOWN" ? "PENDING" : status, amount: pesewasToDecimal(decimalToPesewas(row.amount)) };
  }

  // ─── the provider tells us (public webhook) ─────────────────────────────────

  async handleWebhook(rawBody: Buffer | string | undefined, headers: Record<string, string | string[] | undefined>, body: unknown) {
    const provider = this.providers.active();
    if (!rawBody || !provider.verifySignature(rawBody, headers)) throw new UnauthorizedException("Invalid signature.");
    const evt = provider.parseWebhook(body);
    if (evt.event !== "charge.success" || !evt.reference) return { received: true, handled: false };
    const outcome = await this.processReference(evt.reference);
    return { received: true, handled: outcome.status !== "UNKNOWN" };
  }

  // ─── the one place a payment becomes a receipt ──────────────────────────────

  async processReference(reference: string): Promise<ProcessOutcome> {
    const provider = this.providers.active();
    const row = await this.prisma.finOnlinePayment.findFirst({ where: { provider: provider.name, reference } });
    if (!row) return { status: "UNKNOWN" }; // not ours (the same provider account may serve other things): acknowledge and ignore
    if (row.status === "PAID") return { status: "ALREADY_PAID", receiptId: row.receiptId ?? undefined };

    const verified = await provider.verify(reference);
    if (verified.status === "failed" || verified.status === "abandoned") {
      await this.prisma.finOnlinePayment.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "FAILED", failureReason: `The provider reports the payment ${verified.status}.` } });
      return { status: "FAILED" };
    }
    if (verified.status !== "success") return { status: "PENDING" };

    const requested = decimalToPesewas(row.amount);
    if (verified.currency !== row.currency) return this.review(row.id, `Currency mismatch: expected ${row.currency}, got ${verified.currency}.`);
    if (verified.amountPesewas !== requested) return this.review(row.id, `Amount mismatch: expected ${pesewasToDecimal(requested)}, the provider received ${pesewasToDecimal(verified.amountPesewas)}.`);
    if (verified.feePesewas < 0 || verified.feePesewas > verified.amountPesewas) return this.review(row.id, "The provider fee looks wrong.");

    return this.prisma.$transaction(async (tx) => {
      // Lock the checkout. A second delivery of the same event waits here, then sees PAID and stops.
      const locked = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT status FROM fin_online_payments WHERE id = ${row.id} FOR UPDATE`);
      if (locked.length === 0) return { status: "UNKNOWN" } as ProcessOutcome;
      if (locked[0].status === "PAID") {
        const done = await tx.finOnlinePayment.findFirst({ where: { id: row.id } });
        return { status: "ALREADY_PAID", receiptId: done?.receiptId ?? undefined } as ProcessOutcome;
      }

      const clearing = await tx.finAccount.findFirst({ where: { companyId: row.companyId, systemRole: "payment_clearing", isActive: true } });
      if (!clearing) throw new NeedsSetup('No account has the "Online payments clearing" role yet. Set it in the chart of accounts, then press Retry.');
      if (verified.feePesewas > 0 && !(await tx.finAccount.findFirst({ where: { companyId: row.companyId, systemRole: "provider_fees", isActive: true } }))) {
        throw new NeedsSetup('No account has the "Payment provider fees" role yet. Set it in the chart of accounts, then press Retry.');
      }

      const inv = await tx.finInvoice.findFirst({ where: { id: row.invoiceId, companyId: row.companyId } });
      if (!inv) throw new NeedsSetup("The invoice for this payment no longer exists.");
      const balance = inv.status === "SENT" ? decimalToPesewas(inv.balanceDue) : 0;
      const toInvoice = Math.min(balance, verified.amountPesewas);

      // The payment date: when the provider took the money, never before the invoice existed, and never in a closed period.
      let day = parseDay(verified.paidAt ?? new Date());
      if (day.getTime() < inv.issueDate.getTime()) day = inv.issueDate;
      const locked2 = await this.ledger.lockedThrough(row.companyId, tx);
      if (locked2 && day.getTime() <= locked2.getTime()) day = parseDay(new Date());

      const receipt = await this.payments.recordReceiptTx(
        tx, row.companyId, SYSTEM_USER,
        {
          contactId: row.contactId, receiptDate: dayString(day), method: /mobile/i.test(verified.channel ?? "") ? "MOBILE_MONEY" : "CARD", paidToAccountId: clearing.id,
          amount: pesewasToDecimal(verified.amountPesewas), reference: row.reference, notes: `Online payment via ${row.provider}${verified.channel ? ` (${verified.channel})` : ""}`,
          allocations: toInvoice > 0 ? [{ invoiceId: row.invoiceId, amount: pesewasToDecimal(toInvoice) }] : []
        },
        { userAgent: `webhook:${row.provider}` },
        { fee: verified.feePesewas }
      );
      await tx.finOnlinePayment.update({
        where: { id: row.id },
        data: { status: "PAID", amountPaid: pesewasToDecimal(verified.amountPesewas), fee: pesewasToDecimal(verified.feePesewas), channel: verified.channel?.slice(0, 30) ?? null, providerReference: verified.providerReference, receiptId: receipt.id, paidAt: verified.paidAt ?? new Date(), failureReason: null }
      });
      await this.audit.write(
        { companyId: row.companyId, userId: null, area: "banking", action: "ONLINE_PAYMENT", entityType: "FinOnlinePayment", entityId: row.id, summary: `Online payment ${pesewasToDecimal(verified.amountPesewas)} for ${inv.number ?? "an invoice"} received (receipt ${receipt.number}, fee ${pesewasToDecimal(verified.feePesewas)})`, after: { reference: row.reference, receipt: receipt.number, fee: pesewasToDecimal(verified.feePesewas) }, userAgent: `webhook:${row.provider}` },
        tx
      );
      return { status: "PAID", receiptId: receipt.id } as ProcessOutcome;
    }).catch(async (err) => {
      if (err instanceof NeedsSetup) return this.review(row.id, err.message);
      throw err;
    });
  }

  private async review(id: string, reason: string): Promise<ProcessOutcome> {
    this.logger.warn(`Online payment ${id} needs a person to look at it: ${reason}`);
    await this.prisma.finOnlinePayment.updateMany({ where: { id, status: { in: ["PENDING", "REVIEW", "FAILED"] } }, data: { status: "REVIEW", failureReason: reason.slice(0, 300) } });
    return { status: "REVIEW", reason };
  }

  // ─── staff ──────────────────────────────────────────────────────────────────

  async list(companyId: string, q: { status?: string; page?: number; take?: number }) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.FinOnlinePaymentWhereInput = { companyId, ...(q.status && q.status !== "all" ? { status: q.status as "PENDING" | "PAID" | "FAILED" | "REVIEW" } : {}) };
    const [rows, total, sum] = await Promise.all([
      this.prisma.finOnlinePayment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take }),
      this.prisma.finOnlinePayment.count({ where }),
      this.prisma.finOnlinePayment.aggregate({ where: { companyId, status: "PAID" }, _sum: { amountPaid: true, fee: true } })
    ]);
    const invoices = await this.prisma.finInvoice.findMany({ where: { id: { in: rows.map((r) => r.invoiceId) } }, select: { id: true, number: true, contact: { select: { name: true } } } });
    const byId = new Map(invoices.map((i) => [i.id, i]));
    return {
      rows: rows.map((r) => ({
        id: r.id, provider: r.provider, reference: r.reference, invoiceId: r.invoiceId, invoiceNumber: byId.get(r.invoiceId)?.number ?? null, customer: byId.get(r.invoiceId)?.contact.name ?? "",
        amount: pesewasToDecimal(decimalToPesewas(r.amount)), amountPaid: r.amountPaid ? pesewasToDecimal(decimalToPesewas(r.amountPaid)) : null, fee: pesewasToDecimal(decimalToPesewas(r.fee)),
        channel: r.channel, status: r.status, failureReason: r.failureReason, receiptId: r.receiptId, createdAt: r.createdAt, paidAt: r.paidAt
      })),
      total, page, take,
      totals: { received: pesewasToDecimal(decimalToPesewas(sum._sum.amountPaid)), fees: pesewasToDecimal(decimalToPesewas(sum._sum.fee)) }
    };
  }

  /** Staff "Retry": asks the provider again. Safe: a payment that is already posted is left alone. */
  async retry(companyId: string, id: string) {
    const row = await this.prisma.finOnlinePayment.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException("Online payment not found.");
    return this.processReference(row.reference);
  }
}

/** Money was received but something in our own setup stops us from posting it yet. */
class NeedsSetup extends Error {}
