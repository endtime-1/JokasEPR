import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "../../modules/prisma/prisma.service";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const email = typeof request.body?.email === "string" ? request.body.email.toLowerCase() : "unknown";
    const key = `${request.ip}:${email}`;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + WINDOW_MS);

    const existing = await this.prisma.loginRateLimit.findFirst({
      where: { key, windowEnd: { gt: now } }
    });

    if (!existing) {
      await this.prisma.loginRateLimit.create({ data: { key, attempts: 1, windowEnd } });
      return true;
    }

    if (existing.attempts >= MAX_ATTEMPTS) {
      throw new HttpException("Too many login attempts. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.prisma.loginRateLimit.update({
      where: { id: existing.id },
      data: { attempts: { increment: 1 } }
    });

    return true;
  }
}
