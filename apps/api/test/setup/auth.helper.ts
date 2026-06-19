import { JwtService } from "@nestjs/jwt";
import { AuthenticatedUser } from "@jokas/shared";
import { TEST_ACCESS_SECRET, TEST_REFRESH_SECRET } from "./env";

const jwtService = new JwtService();

export function makeAccessToken(user: Partial<AuthenticatedUser> & { id: string; companyId: string }): string {
  return jwtService.sign(
    {
      sub: user.id,
      org: user.companyId,
      email: user.email ?? "test@jokas.local",
      roles: user.roles ?? [],
      permissions: user.permissions ?? [],
    },
    { secret: TEST_ACCESS_SECRET, expiresIn: "15m" }
  );
}

export function makeRefreshToken(userId: string, companyId: string, jti: string): string {
  return jwtService.sign(
    { sub: userId, org: companyId, jti, typ: "refresh" },
    { secret: TEST_REFRESH_SECRET, expiresIn: "30d" }
  );
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
