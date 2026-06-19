import { Body, Controller, Get, Headers, Ip, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { AssignUserAccessDto } from "./dto/assign-user-access.dto";
import { AssignUserRolesDto } from "./dto/assign-user-roles.dto";
import { CreateRoleDto } from "./dto/create-role.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { IdentityService } from "./identity.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.IDENTITY_READ)
@Controller("identity")
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get("users")
  users(@CurrentUser() user: AuthenticatedUser) {
    return this.identityService.listUsers(user.companyId);
  }

  @Post("users")
  @RequirePermissions(PERMISSIONS.IDENTITY_MANAGE)
  createUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.identityService.createUser(user, dto, { ipAddress, userAgent });
  }

  @Patch("users/:id/status")
  @RequirePermissions(PERMISSIONS.IDENTITY_MANAGE)
  updateUserStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") userId: string,
    @Body() dto: UpdateUserStatusDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.identityService.updateUserStatus(user, userId, dto, { ipAddress, userAgent });
  }

  @Put("users/:id/roles")
  @RequirePermissions(PERMISSIONS.IDENTITY_MANAGE)
  assignUserRoles(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") userId: string,
    @Body() dto: AssignUserRolesDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.identityService.assignUserRoles(user, userId, dto, { ipAddress, userAgent });
  }

  @Put("users/:id/access")
  @RequirePermissions(PERMISSIONS.IDENTITY_MANAGE)
  assignUserAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") userId: string,
    @Body() dto: AssignUserAccessDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.identityService.assignUserAccess(user, userId, dto, { ipAddress, userAgent });
  }

  @Get("roles")
  roles(@CurrentUser() user: AuthenticatedUser) {
    return this.identityService.listRoles(user.companyId);
  }

  @Post("roles")
  @RequirePermissions(PERMISSIONS.IDENTITY_MANAGE)
  createRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoleDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.identityService.createRole(user, dto, { ipAddress, userAgent });
  }

  @Get("permissions")
  permissions(@CurrentUser() user: AuthenticatedUser) {
    return this.identityService.listPermissions(user.companyId);
  }
}

