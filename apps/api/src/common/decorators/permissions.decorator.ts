import { SetMetadata } from "@nestjs/common";
import { PermissionKey } from "@jokas/shared";

export const REQUIRED_PERMISSIONS_KEY = "requiredPermissions";
export const RequirePermissions = (...permissions: PermissionKey[]) => SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

