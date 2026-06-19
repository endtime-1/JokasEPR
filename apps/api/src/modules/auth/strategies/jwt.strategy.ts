import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthenticatedUser } from "@jokas/shared";
import { AuthService } from "../auth.service";

type AccessPayload = {
  sub: string;
  org: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => (request?.cookies as Record<string, string> | undefined)?.["jokas_at"] ?? null
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET")
    });
  }

  async validate(payload: AccessPayload): Promise<AuthenticatedUser> {
    const profile = await this.authService.buildProfile(payload.sub);
    if (profile.companyId !== payload.org) {
      throw new UnauthorizedException("Token Company mismatch.");
    }
    return profile;
  }
}
