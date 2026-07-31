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
    let profile: AuthenticatedUser;
    try {
      profile = await this.authService.buildProfile(payload.sub);
    } catch (err) {
      // DB errors during profile load (pool timeout, connection loss) should not
      // surface as 500 — convert them to 401 so the client refreshes the session
      // rather than showing a generic "Internal server error" to the user.
      throw new UnauthorizedException("Session could not be verified. Please try again.");
    }
    if (profile.companyId !== payload.org) {
      throw new UnauthorizedException("Token Company mismatch.");
    }
    return profile;
  }
}
