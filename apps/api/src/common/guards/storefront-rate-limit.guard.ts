import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../modules/prisma/prisma.service";

// Per-IP limits for public storefront endpoints (no auth)
const ORDER_WINDOW_MS = 60 * 60 * 1000;  // 1-hour window
const ORDER_MAX = 10;                      // 10 orders per IP per hour
const BROWSE_WINDOW_MS = 60 * 1000;       // 1-minute window
const BROWSE_MAX = 60;                     // 60 product-browse requests per IP per minute

@Injectable()
export class StorefrontOrderRateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `storefront:order:${request.ip ?? "unknown"}`;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + ORDER_WINDOW_MS);

    const existing = await this.prisma.loginRateLimit.findFirst({
      where: { key, windowEnd: { gt: now } },
    });

    if (!existing) {
      await this.prisma.loginRateLimit.create({ data: { key, attempts: 1, windowEnd } });
      return true;
    }
    if (existing.attempts >= ORDER_MAX) {
      throw new HttpException("Too many orders from this IP. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.prisma.loginRateLimit.update({
      where: { id: existing.id },
      data: { attempts: { increment: 1 } },
    });
    return true;
  }
}

@Injectable()
export class StorefrontBrowseRateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `storefront:browse:${request.ip ?? "unknown"}`;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + BROWSE_WINDOW_MS);

    const existing = await this.prisma.loginRateLimit.findFirst({
      where: { key, windowEnd: { gt: now } },
    });

    if (!existing) {
      await this.prisma.loginRateLimit.create({ data: { key, attempts: 1, windowEnd } });
      return true;
    }
    if (existing.attempts >= BROWSE_MAX) {
      throw new HttpException("Too many requests. Slow down.", HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.prisma.loginRateLimit.update({
      where: { id: existing.id },
      data: { attempts: { increment: 1 } },
    });
    return true;
  }
}
