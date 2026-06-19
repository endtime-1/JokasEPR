import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticatedUser } from "@jokas/shared";
import { REQUIRED_SCOPE_ACCESS_KEY, ScopeAccessRule } from "../decorators/scope-access.decorator";

@Injectable()
export class ScopeAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<ScopeAccessRule>(REQUIRED_SCOPE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!rule) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown> & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException("Authenticated user context is missing.");
    }
    if (user.hasGlobalAccess) {
      return true;
    }

    const source = (request[rule.source ?? "body"] ?? {}) as Record<string, unknown>;
    this.assertScope(source, rule.branchId, user.branchIds, "branch");
    this.assertScope(source, rule.farmId, user.farmIds, "farm");
    this.assertScope(source, rule.warehouseId, user.warehouseIds, "warehouse");
    this.assertScope(source, rule.productionSiteId, user.productionSiteIds, "production site");

    return true;
  }

  private assertScope(source: Record<string, unknown>, field: string | undefined, allowedIds: string[], label: string) {
    if (!field) {
      return;
    }

    const value = source[field];

    // Field not present in the payload — DTO validation handles required fields
    if (value === undefined || value === null) {
      return;
    }

    // Present but not a non-empty string — reject to prevent type-confusion bypass
    if (typeof value !== "string" || value.length === 0) {
      throw new ForbiddenException(`Invalid ${label} identifier.`);
    }

    if (!allowedIds.includes(value)) {
      throw new ForbiddenException(`You do not have access to this ${label}.`);
    }
  }
}
