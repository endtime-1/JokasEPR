import { Body, Controller, Get, Headers, Ip, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { AuthenticatedUser } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { LoginRateLimitGuard } from "../../common/guards/login-rate-limit.guard";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService
  ) {}

  @Post("login")
  @UseGuards(LoginRateLimitGuard)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    const result = await this.authService.login(dto, { ipAddress, userAgent });
    this.setAuthCookies(response, result.data.accessToken, result.data.refreshToken, result.data.refreshTtlDays);
    return result;
  }

  @Post("refresh")
  async refresh(
    @Body() body: Partial<RefreshTokenDto>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    const token = body.refreshToken ?? (request.cookies as Record<string, string> | undefined)?.["jokas_rt"];
    if (!token) {
      response.clearCookie("jokas_at", this.baseCookieOpts());
      response.clearCookie("jokas_rt", this.baseCookieOpts());
      throw new Error("Refresh token required.");
    }
    const result = await this.authService.refresh(token, { ipAddress, userAgent });
    this.setAuthCookies(response, result.data.accessToken, result.data.refreshToken, result.data.refreshTtlDays);
    return result;
  }

  @Post("logout")
  async logout(
    @Body() body: Partial<RefreshTokenDto>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    response.clearCookie("jokas_at", this.baseCookieOpts());
    response.clearCookie("jokas_rt", this.baseCookieOpts());
    const token = body.refreshToken ?? (request.cookies as Record<string, string> | undefined)?.["jokas_rt"];
    if (token) {
      return this.authService.logout(token);
    }
    return { data: { success: true } };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return { data: user, meta: { ip: request.ip } };
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Ip() ipAddress: string,
    @Headers("user-agent") userAgent?: string
  ) {
    return this.authService.changePassword(user, dto, { ipAddress, userAgent });
  }

  private baseCookieOpts() {
    const isProduction = this.config.get("NODE_ENV") === "production";
    return { httpOnly: true, sameSite: "lax" as const, secure: isProduction, path: "/" };
  }

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string, refreshTtlDays: number) {
    const base = this.baseCookieOpts();
    const accessTtlSec = this.parseTtlToSeconds(this.config.get<string>("JWT_ACCESS_TTL", "15m"));
    response.cookie("jokas_at", accessToken, { ...base, maxAge: accessTtlSec * 1000 });
    response.cookie("jokas_rt", refreshToken, { ...base, maxAge: refreshTtlDays * 24 * 60 * 60 * 1000 });
  }

  private parseTtlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 15 * 60;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * (multipliers[unit] ?? 60);
  }
}
