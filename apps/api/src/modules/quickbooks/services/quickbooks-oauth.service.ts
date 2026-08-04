import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksTokenService } from "./quickbooks-token.service";

const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const QB_SCOPE = "com.intuit.quickbooks.accounting";
const STATE_TTL_MS = 600_000; // 10 minutes

type OAuthStatePayload = { nonce: string; companyId: string; userId: string; exp: number };

@Injectable()
export class QuickBooksOAuthService {
  // State is encoded as a signed token (base64url payload + "." + HMAC-SHA256 hex).
  // No in-memory Map — survives server restarts and PM2 cluster forks.

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokenService: QuickBooksTokenService
  ) {}

  private get stateSigningKey(): string {
    return this.config.getOrThrow<string>("JWT_ACCESS_SECRET");
  }

  private signState(payload: OAuthStatePayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", this.stateSigningKey).update(encoded).digest("hex");
    return `${encoded}.${sig}`;
  }

  private verifyState(state: string): OAuthStatePayload {
    const dot = state.lastIndexOf(".");
    if (dot < 0) throw new UnauthorizedException("Invalid OAuth state format");

    const encoded = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    const expectedSig = createHmac("sha256", this.stateSigningKey).update(encoded).digest("hex");

    // Constant-time comparison prevents timing-oracle attacks on the HMAC.
    if (
      sig.length !== expectedSig.length ||
      !timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))
    ) {
      throw new UnauthorizedException("Invalid OAuth state signature");
    }

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as OAuthStatePayload;
    if (payload.exp < Date.now()) throw new UnauthorizedException("OAuth state expired — please retry the connection");

    return payload;
  }

  getAuthorizationUrl(companyId: string, userId: string): string {
    const clientId = this.config.get<string>("QB_CLIENT_ID");
    const redirectUri = this.config.get<string>("QB_REDIRECT_URI");
    if (!clientId || !redirectUri) throw new BadRequestException("QuickBooks client credentials not configured");

    const state = this.signState({
      nonce: randomBytes(16).toString("hex"),
      companyId,
      userId,
      exp: Date.now() + STATE_TTL_MS,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      scope: QB_SCOPE,
      redirect_uri: redirectUri,
      response_type: "code",
      state
    });
    return `${QB_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, state: string, realmId: string): Promise<{ companyId: string; redirectUrl: string }> {
    const { companyId, userId } = this.verifyState(state);
    const tokens = await this.exchangeCodeForTokens(code, realmId);

    const environment = (this.config.get<string>("QB_ENVIRONMENT") ?? "sandbox").toUpperCase() as "SANDBOX" | "PRODUCTION";

    await this.prisma.quickBooksConnection.upsert({
      where: { companyId },
      create: { companyId, realmId, environment, connectedById: userId, isActive: true },
      update: { realmId, environment, connectedById: userId, isActive: true, connectedAt: new Date(), disconnectedAt: null }
    });

    const connection = await this.prisma.quickBooksConnection.findUniqueOrThrow({ where: { companyId } });
    await this.tokenService.storeTokens(connection.id, tokens.accessToken, tokens.refreshToken, tokens.accessExpiresAt, tokens.refreshExpiresAt);

    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    return { companyId, redirectUrl: `${webOrigin}/quickbooks?connected=true` };
  }

  async refreshAccessToken(connectionId: string): Promise<string> {
    const tokens = await this.tokenService.getDecryptedTokens(connectionId);
    if (!tokens) throw new NotFoundException("No tokens found for connection");
    if (tokens.refreshTokenExpiresAt < new Date()) throw new UnauthorizedException("Refresh token expired — please reconnect QuickBooks");

    const clientId = this.config.get<string>("QB_CLIENT_ID")!;
    const clientSecret = this.config.get<string>("QB_CLIENT_SECRET")!;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const resp = await axios.post<{ access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number }>(
      QB_TOKEN_URL,
      new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }).toString(),
      { headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" } }
    );

    const { access_token, refresh_token, expires_in, x_refresh_token_expires_in } = resp.data;
    const accessExpiresAt = new Date(Date.now() + expires_in * 1000);
    const refreshExpiresAt = new Date(Date.now() + x_refresh_token_expires_in * 1000);

    await this.tokenService.storeTokens(connectionId, access_token, refresh_token, accessExpiresAt, refreshExpiresAt);
    return access_token;
  }

  async disconnect(companyId: string): Promise<void> {
    const connection = await this.prisma.quickBooksConnection.findUnique({ where: { companyId } });
    if (!connection) return;

    const tokens = await this.tokenService.getDecryptedTokens(connection.id);
    if (tokens) {
      try {
        const clientId = this.config.get<string>("QB_CLIENT_ID")!;
        const clientSecret = this.config.get<string>("QB_CLIENT_SECRET")!;
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        await axios.post(QB_REVOKE_URL, new URLSearchParams({ token: tokens.refreshToken }).toString(), {
          headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }
        });
      } catch {
        // Revoking is best-effort; continue with local cleanup
      }
    }

    await this.tokenService.deleteTokens(connection.id);
    await this.prisma.quickBooksConnection.update({
      where: { companyId },
      data: { isActive: false, disconnectedAt: new Date() }
    });
  }

  private async exchangeCodeForTokens(code: string, _realmId: string) {
    const clientId = this.config.get<string>("QB_CLIENT_ID")!;
    const clientSecret = this.config.get<string>("QB_CLIENT_SECRET")!;
    const redirectUri = this.config.get<string>("QB_REDIRECT_URI")!;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const resp = await axios.post<{ access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number }>(
      QB_TOKEN_URL,
      new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
      { headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" } }
    );

    const { access_token, refresh_token, expires_in, x_refresh_token_expires_in } = resp.data;
    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      accessExpiresAt: new Date(Date.now() + expires_in * 1000),
      refreshExpiresAt: new Date(Date.now() + x_refresh_token_expires_in * 1000)
    };
  }
}
