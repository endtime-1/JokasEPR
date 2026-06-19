import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Request } from "express";

type AttemptBucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private static readonly buckets = new Map<string, AttemptBucket>();
  private readonly windowMs = 15 * 60 * 1000;
  private readonly maxAttempts = 8;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const email = typeof request.body?.email === "string" ? request.body.email.toLowerCase() : "unknown";
    const key = `${request.ip}:${email}`;
    const now = Date.now();
    const current = LoginRateLimitGuard.buckets.get(key);

    if (!current || current.resetAt <= now) {
      LoginRateLimitGuard.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (current.count >= this.maxAttempts) {
      throw new HttpException("Too many login attempts. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }

    current.count += 1;
    return true;
  }
}
