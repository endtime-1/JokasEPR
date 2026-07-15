import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticatedUser, PermissionKey } from "@jokas/shared";
import { REQUIRED_PERMISSIONS_KEY } from "../decorators/permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException("Authenticated user context is missing.");
    }

    const allowed = user.hasGlobalAccess || required.every((permission) => user.permissions.includes(permission));
    if (!allowed) {
      throw new ForbiddenException("Insufficient permissions for this action.");
    }

    return true;
  }
}

