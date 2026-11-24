import { Controller, HttpCode, Post, RawBodyRequest, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { FinOnlinePaymentsService } from "./fin-online-payments.service";

/**
 * Payment provider webhooks. Public by necessity (the provider has no login), so the signature is everything:
 * the exact bytes received are checked against the provider's HMAC before anything is read, and then the provider is asked
 * directly about the transaction. An invalid signature is answered 401 and nothing else happens.
 * Always acknowledged quickly with 200 when valid, so the provider stops retrying; the posting itself is idempotent.
 */
@Public()
@Controller("fin/webhooks")
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class FinWebhooksController {
  constructor(private readonly online: FinOnlinePaymentsService) {}

  @Post("paystack")
  @HttpCode(200)
  async paystack(@Req() req: RawBodyRequest<Request>) {
    return this.online.handleWebhook(req.rawBody, req.headers as Record<string, string | string[] | undefined>, req.body);
  }
}
