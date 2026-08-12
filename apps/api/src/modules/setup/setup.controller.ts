import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SetupDto } from "./dto/setup.dto";
import { SetupService } from "./setup.service";

@Controller("setup")
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  // H-OPS-3: every other public endpoint has its own dedicated throttle on top
  // of the site-wide 300/min guard (see auth.controller.ts's login for the
  // pattern) — this one relied on the general limit alone. Practical risk was
  // already low (a secret token check gates setup() and it only works once,
  // before any user account exists) but there's no reason for this one
  // endpoint to be the exception to a pattern applied everywhere else.
  @Get("status")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  status() {
    return this.setupService.status();
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  setup(@Body() dto: SetupDto, @Headers("x-setup-token") setupToken?: string) {
    return this.setupService.setup(dto, setupToken);
  }
}
