import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../modules/prisma/prisma.service";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

// In-memory fallback used when the DB is unavailable — preserves rate limiting
// during transient DB outages so an attacker can't bypass limits via a DB blip.
const _memFallback = new Map<string, { attempts: number; windowEnd: number }>();

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(LoginRateLimitGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const email = typeof request.body?.email === "string" ? request.body.email.toLowerCase() : "unknown";
    const key = `${request.ip}:${email}`;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + WINDOW_MS);

    try {
      const existing = await this.prisma.loginRateLimit.findUnique({
        where: { key }
      });

      if (!existing || existing.windowEnd <= now) {
        // Upsert — unique key constraint prevents duplicate rows under concurrency.
        await this.prisma.loginRateLimit.upsert({
          where: { key },
          create: { key, attempts: 1, windowEnd },
          update: { attempts: 1, windowEnd },
        });
        return true;
      }

      if (existing.attempts >= MAX_ATTEMPTS) {
        throw new HttpException("Too many login attempts. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
      }

      await this.prisma.loginRateLimit.update({
        where: { key },
        data: { attempts: { increment: 1 } }
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // DB unavailable — fall back to in-memory tracking so rate limiting is preserved.
      this.logger.error("LoginRateLimit DB error — using in-memory fallback", (err as Error).message);
      return this.memCheck(key, now.getTime(), windowEnd.getTime());
    }

    return true;
  }

  private memCheck(key: string, nowMs: number, windowEndMs: number): boolean {
    const entry = _memFallback.get(key);
    if (!entry || entry.windowEnd <= nowMs) {
      _memFallback.set(key, { attempts: 1, windowEnd: windowEndMs });
      return true;
    }
    if (entry.attempts >= MAX_ATTEMPTS) {
      throw new HttpException("Too many login attempts. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }
    entry.attempts += 1;
    return true;
  }
}
