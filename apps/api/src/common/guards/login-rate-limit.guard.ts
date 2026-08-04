import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../modules/prisma/prisma.service";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

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
      // DB unavailable or table missing — log and allow login to proceed rather than blocking all users.
      this.logger.error("LoginRateLimit DB error — rate limiting skipped", (err as Error).message);
    }

    return true;
  }
}
