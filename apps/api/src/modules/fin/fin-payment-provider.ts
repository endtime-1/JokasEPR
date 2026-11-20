import { createHmac, timingSafeEqual } from "crypto";
import { BadGatewayException } from "@nestjs/common";

/**
 * An online payment provider (Paystack today; Hubtel can be added the same way). The finance code only ever talks to this
 * interface, so supporting another provider means writing one more class, not changing any posting or webhook logic.
 */

export type CheckoutRequest = {
  reference: string;
  amountPesewas: number;
  email: string;
  currency: string;
  callbackUrl: string;
  metadata: Record<string, string | number>;
};

export type CheckoutResult = { url: string; providerReference: string | null };

export type VerifiedTransaction = {
  reference: string;
  status: "success" | "failed" | "pending" | "abandoned";
  amountPesewas: number;
  feePesewas: number;
  currency: string;
  channel: string | null;
  providerReference: string | null;
  paidAt: Date | null;
};

export type WebhookEvent = { event: string; reference: string | null };

export interface PaymentProvider {
  readonly name: string;
  /** false when the keys are not in .env: the Pay now button is then hidden and checkouts are refused. */
  isConfigured(): boolean;
  initialize(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Asks the provider itself what happened to a transaction. Webhooks are never trusted on their own. */
  verify(reference: string): Promise<VerifiedTransaction>;
  /** True only if the request really came from the provider (checked against the exact bytes received). */
  verifySignature(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(body: unknown): WebhookEvent;
}

const PAYSTACK = "https://api.paystack.co";

/** Paystack: cards and mobile money (MTN MoMo, Telecel Cash, AT Money) in Ghana. */
export class PaystackProvider implements PaymentProvider {
  readonly name = "paystack";

  private get secret(): string {
    return process.env.PAYSTACK_SECRET_KEY ?? "";
  }

  isConfigured(): boolean {
    return this.secret.length >= 10;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(`${PAYSTACK}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal
      });
      const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: unknown } | null;
      if (!res.ok || !json || json.status !== true) throw new BadGatewayException(`The payment provider answered: ${json?.message ?? res.status}`);
      return json.data as T;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException("Could not reach the payment provider. Please try again.");
    } finally {
      clearTimeout(timer);
    }
  }

  async initialize(req: CheckoutRequest): Promise<CheckoutResult> {
    const data = await this.call<{ authorization_url: string; access_code?: string; reference?: string }>("POST", "/transaction/initialize", {
      email: req.email,
      amount: req.amountPesewas, // Paystack takes the smallest unit: pesewas for GHS
      currency: req.currency,
      reference: req.reference,
      callback_url: req.callbackUrl,
      metadata: req.metadata
    });
    if (!data?.authorization_url) throw new BadGatewayException("The payment provider did not return a payment page.");
    return { url: data.authorization_url, providerReference: data.access_code ?? null };
  }

  async verify(reference: string): Promise<VerifiedTransaction> {
    const d = await this.call<{ status: string; amount: number; fees?: number | null; currency: string; channel?: string | null; id?: number | string; paid_at?: string | null; reference: string }>(
      "GET",
      `/transaction/verify/${encodeURIComponent(reference)}`
    );
    const status = d.status === "success" ? "success" : d.status === "failed" ? "failed" : d.status === "abandoned" ? "abandoned" : "pending";
    return {
      reference: d.reference,
      status,
      amountPesewas: Number(d.amount ?? 0),
      feePesewas: Number(d.fees ?? 0),
      currency: d.currency,
      channel: d.channel ?? null,
      providerReference: d.id !== undefined ? String(d.id) : null,
      paidAt: d.paid_at ? new Date(d.paid_at) : null
    };
  }

  /** Paystack signs the raw body with HMAC-SHA512 using the secret key, hex-encoded, in x-paystack-signature. */
  verifySignature(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>): boolean {
    if (!this.isConfigured()) return false;
    const header = headers["x-paystack-signature"];
    const given = Array.isArray(header) ? header[0] : header;
    if (!given || !rawBody) return false;
    const expected = createHmac("sha512", this.secret).update(rawBody).digest("hex");
    const a = Buffer.from(given.toLowerCase());
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(body: unknown): WebhookEvent {
    const b = (body ?? {}) as { event?: string; data?: { reference?: string } };
    return { event: String(b.event ?? ""), reference: b.data?.reference ? String(b.data.reference) : null };
  }
}
