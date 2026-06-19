import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksTokenService } from "./quickbooks-token.service";

const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const QB_SCOPE = "com.intuit.quickbooks.accounting";

@Injectable()
export class QuickBooksOAuthService {
  private pendingStates = new Map<string, { companyId: string; userId: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokenService: QuickBooksTokenService
  ) {}

  getAuthorizationUrl(companyId: string, userId: string): string {
    const clientId = this.config.get<string>("QB_CLIENT_ID");
    const redirectUri = this.config.get<string>("QB_REDIRECT_URI");
    if (!clientId || !redirectUri) throw new BadRequestException("QuickBooks client credentials not configured");

    const state = randomBytes(16).toString("hex");
    // State expires in 10 minutes
    this.pendingStates.set(state, { companyId, userId, expiresAt: Date.now() + 600_000 });

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
    const pending = this.pendingStates.get(state);
    if (!pending || pending.expiresAt < Date.now()) {
      this.pendingStates.delete(state);
      throw new UnauthorizedException("Invalid or expired OAuth state");
    }
    this.pendingStates.delete(state);

    const { companyId, userId } = pending;
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
