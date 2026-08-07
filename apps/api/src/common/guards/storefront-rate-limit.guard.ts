import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../modules/prisma/prisma.service";

// Per-IP limits for public storefront endpoints (no auth)
const ORDER_WINDOW_MS = 60 * 60 * 1000;  // 1-hour window
const ORDER_MAX = 10;                      // 10 orders per IP per hour
const BROWSE_WINDOW_MS = 60 * 1000;       // 1-minute window
const BROWSE_MAX = 60;                     // 60 product-browse requests per IP per minute

// M6: both guards below previously did a find-then-create against a unique
// `key` column with no protection against concurrent requests racing the
// same window — the loser of the race hit a unique-constraint violation,
// which the catch block treated as "DB error, allow the request", so a
// concurrent burst evaded both counting and limiting simultaneously. Mirrors
// the upsert + in-memory-fallback pattern already used by
// login-rate-limit.guard.ts for the identical race.
const _orderMemFallback = new Map<string, { attempts: number; windowEnd: number }>();
const _browseMemFallback = new Map<string, { attempts: number; windowEnd: number }>();

@Injectable()
export class StorefrontOrderRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(StorefrontOrderRateLimitGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `storefront:order:${request.ip ?? "unknown"}`;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + ORDER_WINDOW_MS);

    try {
      const existing = await this.prisma.loginRateLimit.findUnique({ where: { key } });

      if (!existing || existing.windowEnd <= now) {
        // Upsert — unique key constraint prevents duplicate rows under concurrency.
        await this.prisma.loginRateLimit.upsert({
          where: { key },
          create: { key, attempts: 1, windowEnd },
          update: { attempts: 1, windowEnd },
        });
        return true;
      }

      if (existing.attempts >= ORDER_MAX) {
        throw new HttpException("Too many orders from this IP. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
      }

      await this.prisma.loginRateLimit.update({
        where: { key },
        data: { attempts: { increment: 1 } },
      });
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error("StorefrontOrderRateLimit DB error — using in-memory fallback", (err as Error).message);
      return this.memCheck(key, now.getTime(), windowEnd.getTime());
    }
  }

  private memCheck(key: string, nowMs: number, windowEndMs: number): boolean {
    const entry = _orderMemFallback.get(key);
    if (!entry || entry.windowEnd <= nowMs) {
      _orderMemFallback.set(key, { attempts: 1, windowEnd: windowEndMs });
      return true;
    }
    if (entry.attempts >= ORDER_MAX) {
      throw new HttpException("Too many orders from this IP. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }
    entry.attempts += 1;
    return true;
  }
}

@Injectable()
export class StorefrontBrowseRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(StorefrontBrowseRateLimitGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = `storefront:browse:${request.ip ?? "unknown"}`;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + BROWSE_WINDOW_MS);

    try {
      const existing = await this.prisma.loginRateLimit.findUnique({ where: { key } });

      if (!existing || existing.windowEnd <= now) {
        await this.prisma.loginRateLimit.upsert({
          where: { key },
          create: { key, attempts: 1, windowEnd },
          update: { attempts: 1, windowEnd },
        });
        return true;
      }

      if (existing.attempts >= BROWSE_MAX) {
        throw new HttpException("Too many requests. Slow down.", HttpStatus.TOO_MANY_REQUESTS);
      }

      await this.prisma.loginRateLimit.update({
        where: { key },
        data: { attempts: { increment: 1 } },
      });
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error("StorefrontBrowseRateLimit DB error — using in-memory fallback", (err as Error).message);
      return this.memCheck(key, now.getTime(), windowEnd.getTime());
    }
  }

  private memCheck(key: string, nowMs: number, windowEndMs: number): boolean {
    const entry = _browseMemFallback.get(key);
    if (!entry || entry.windowEnd <= nowMs) {
      _browseMemFallback.set(key, { attempts: 1, windowEnd: windowEndMs });
      return true;
    }
    if (entry.attempts >= BROWSE_MAX) {
      throw new HttpException("Too many requests. Slow down.", HttpStatus.TOO_MANY_REQUESTS);
    }
    entry.attempts += 1;
    return true;
  }
}
