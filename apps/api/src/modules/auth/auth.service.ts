import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type RefreshPayload = {
  sub: string;
  org: string;
  jti: string;
  typ: "refresh";
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — well inside the 15-min JWT access TTL

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly profileCache = new Map<string, { profile: AuthenticatedUser; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService
  ) {}

  async login(dto: LoginDto, context: RequestContext) {
    const user = await this.findLoginUser(dto.email, dto.companyId);

    if (!user || user.status !== UserStatus.ACTIVE || user.deletedAt) {
      await this.auditFailedLogin(dto.email, user?.companyId ?? dto.companyId, user?.id, context, user ? "Account is inactive or deleted" : "User not found");
      throw new UnauthorizedException("Invalid credentials.");
    }

    // Account lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      await this.auditFailedLogin(user.email, user.companyId, user.id, context, "Account is locked");
      throw new UnauthorizedException(`Account is temporarily locked. Try again in ${remainingMin} minute(s).`);
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
      const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS;
      const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: newAttempts, ...(shouldLock ? { lockedUntil } : {}) }
      });

      await this.auditFailedLogin(user.email, user.companyId, user.id, context, shouldLock ? `Account locked after ${newAttempts} failed attempts` : "Invalid password");
      throw new UnauthorizedException("Invalid credentials.");
    }

    // Successful login — reset lockout counters
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null }
    });

    const profile = await this.buildProfile(user.id);
    const tokens = await this.issueTokens(profile, context);

    await this.audit.write({
      companyId: user.companyId,
      actorUserId: user.id,
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
      summary: "User logged in",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { data: { user: profile, ...tokens } };
  }

  async refresh(refreshToken: string, context: RequestContext) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        id: payload.jti,
        userId: payload.sub,
        companyId: payload.org,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      }
    });

    if (!stored || !(await bcrypt.compare(refreshToken, stored.tokenHash))) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const profile = await this.buildProfile(payload.sub);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() }
    });
    const tokens = await this.issueTokens(profile, context);

    await this.audit.write({
      companyId: profile.companyId,
      actorUserId: profile.id,
      action: "TOKEN_REFRESH",
      entityType: "RefreshToken",
      entityId: stored.id,
      summary: "Refresh token rotated",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { data: { user: profile, ...tokens } };
  }

  async logout(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    this.clearProfileCache(payload.sub);

    await this.audit.write({
      companyId: payload.org,
      actorUserId: payload.sub,
      action: "LOGOUT",
      entityType: "RefreshToken",
      entityId: payload.jti,
      summary: "User logged out"
    });

    return { data: { success: true } };
  }

  async changePassword(actor: AuthenticatedUser, dto: ChangePasswordDto, context: RequestContext) {
    const user = await this.prisma.user.findFirst({ where: { id: actor.id, deletedAt: null } });
    if (!user) throw new UnauthorizedException("User not found.");

    const currentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!currentValid) {
      await this.auditFailedLogin(user.email, user.companyId, user.id, context, "Wrong current password on change-password");
      throw new UnauthorizedException("Current password is incorrect.");
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: actor.id },
      data: { passwordHash: newHash, passwordChangedAt: new Date() }
    });

    // Revoke all existing refresh tokens so all sessions are invalidated
    await this.prisma.refreshToken.updateMany({
      where: { userId: actor.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    this.clearProfileCache(actor.id);

    await this.audit.write({
      companyId: actor.companyId,
      actorUserId: actor.id,
      action: "UPDATE",
      entityType: "User",
      entityId: actor.id,
      summary: "User changed their password",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return { data: { success: true } };
  }

  clearProfileCache(userId: string) {
    this.profileCache.delete(userId);
  }

  async buildProfile(userId: string): Promise<AuthenticatedUser> {
    const cached = this.profileCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.profile;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: UserStatus.ACTIVE },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: true
              }
            }
          }
        },
        branchAccesses: { select: { branchId: true } },
        farmAccesses: { select: { farmId: true } },
        warehouseAccesses: { select: { warehouseId: true } },
        productionSiteAccess: { select: { productionSiteId: true } }
      }
    });

    if (!user) {
      throw new UnauthorizedException("User is no longer active.");
    }

    const roles = user.roles.map((item) => item.role.level as string);
    const permissions = Array.from(
      new Set(user.roles.flatMap((item) => item.role.permissions.map((permission) => permission.key)))
    );
    const hasGlobalAccess = roles.includes("SUPER_ADMIN") || roles.includes("CEO");

    const profile: AuthenticatedUser = {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      fullName: user.fullName,
      roles,
      permissions,
      branchIds: user.branchAccesses.map((access) => access.branchId),
      farmIds: user.farmAccesses.map((access) => access.farmId),
      warehouseIds: user.warehouseAccesses.map((access) => access.warehouseId),
      productionSiteIds: user.productionSiteAccess.map((access) => access.productionSiteId),
      hasGlobalAccess
    };
    this.profileCache.set(userId, { profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
    return profile;
  }

  private async findLoginUser(email: string, companyId?: string) {
    if (companyId) {
      return this.prisma.user.findFirst({
        where: { email: email.toLowerCase(), companyId }
      });
    }

    const users = await this.prisma.user.findMany({
      where: { email: email.toLowerCase() },
      take: 2
    });

    if (users.length > 1) {
      throw new UnauthorizedException("Company is required for this account.");
    }

    return users[0];
  }

  private async issueTokens(user: AuthenticatedUser, context: RequestContext) {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        org: user.companyId,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions
      },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_TTL", "15m")
      }
    );

    const refreshTtlDays = Number(this.config.get<string>("JWT_REFRESH_TTL_DAYS", "30"));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshTtlDays);

    // Create a placeholder record first to obtain the ID (used as JWT jti claim),
    // then sign and hash the token, and update atomically in a transaction so an
    // interrupted process never leaves a row with tokenHash="pending".
    const [stored, refreshToken] = await this.prisma.$transaction(async (tx) => {
      const record = await tx.refreshToken.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          tokenHash: "pending",
          expiresAt,
          userAgent: context.userAgent,
          ipAddress: context.ipAddress
        }
      });

      const token = await this.jwtService.signAsync(
        { sub: user.id, org: user.companyId, jti: record.id, typ: "refresh" },
        {
          secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
          expiresIn: `${refreshTtlDays}d`
        }
      );

      await tx.refreshToken.update({
        where: { id: record.id },
        data: { tokenHash: await bcrypt.hash(token, 12) }
      });

      return [record, token] as const;
    });
    void stored;

    return { accessToken, refreshToken, tokenType: "Bearer", refreshTtlDays };
  }

  private async auditFailedLogin(
    email: string,
    companyId: string | undefined,
    actorUserId: string | undefined,
    context: RequestContext,
    reason: string
  ) {
    if (!companyId) {
      this.logger.warn(`Failed login for unknown account: ${email.toLowerCase()} — ${reason} — IP: ${context.ipAddress ?? "unknown"}`);
      return;
    }

    await this.audit.write({
      companyId,
      actorUserId,
      action: "FAILED_LOGIN",
      entityType: "User",
      entityId: actorUserId,
      summary: `Failed login attempt for ${email.toLowerCase()}`,
      metadata: { reason },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
  }

  private async verifyRefreshToken(token: string): Promise<RefreshPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET")
      });
      if (payload.typ !== "refresh") {
        throw new UnauthorizedException("Invalid refresh token.");
      }
      return payload;
    } catch {
      throw new UnauthorizedException("Invalid refresh token.");
    }
  }
}
