import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksTokenService } from "./quickbooks-token.service";
import { QuickBooksOAuthService } from "./quickbooks-oauth.service";

const MINOR_VERSION = "65";
const MAX_RETRIES = 3;

@Injectable()
export class QuickBooksClientService {
  private readonly logger = new Logger(QuickBooksClientService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: QuickBooksTokenService,
    private readonly oauthService: QuickBooksOAuthService
  ) {}

  private baseUrl(environment: string): string {
    return environment === "PRODUCTION"
      ? "https://quickbooks.api.intuit.com/v3/company"
      : "https://sandbox-quickbooks.api.intuit.com/v3/company";
  }

  private async getValidAccessToken(companyId: string): Promise<{ accessToken: string; realmId: string; baseUrl: string }> {
    const connection = await this.prisma.quickBooksConnection.findUnique({ where: { companyId } });
    if (!connection || !connection.isActive) {
      throw new ServiceUnavailableException("QuickBooks is not connected for this company");
    }

    let accessToken: string;
    if (await this.tokenService.isAccessTokenExpired(connection.id)) {
      accessToken = await this.oauthService.refreshAccessToken(connection.id);
    } else {
      const tokens = await this.tokenService.getDecryptedTokens(connection.id);
      if (!tokens) throw new ServiceUnavailableException("QuickBooks tokens not found");
      accessToken = tokens.accessToken;
    }

    return { accessToken, realmId: connection.realmId, baseUrl: this.baseUrl(connection.environment) };
  }

  async query<T = unknown>(companyId: string, sql: string): Promise<T> {
    const { accessToken, realmId, baseUrl } = await this.getValidAccessToken(companyId);
    return this.request<T>(accessToken, {
      method: "GET",
      url: `${baseUrl}/${realmId}/query`,
      params: { query: sql, minorversion: MINOR_VERSION },
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
    });
  }

  async get<T = unknown>(companyId: string, path: string, params?: Record<string, string>): Promise<T> {
    const { accessToken, realmId, baseUrl } = await this.getValidAccessToken(companyId);
    return this.request<T>(accessToken, {
      method: "GET",
      url: `${baseUrl}/${realmId}/${path}`,
      params: { ...params, minorversion: MINOR_VERSION },
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
    });
  }

  async post<T = unknown>(companyId: string, path: string, body: unknown): Promise<T> {
    const { accessToken, realmId, baseUrl } = await this.getValidAccessToken(companyId);
    return this.request<T>(accessToken, {
      method: "POST",
      url: `${baseUrl}/${realmId}/${path}`,
      params: { minorversion: MINOR_VERSION },
      data: body,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" }
    });
  }

  private async request<T>(accessToken: string, config: AxiosRequestConfig, attempt = 1): Promise<T> {
    try {
      const resp = await axios.request<T>(config);
      return resp.data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 429 && attempt <= MAX_RETRIES) {
          const retryAfter = Number(err.response?.headers?.["retry-after"] ?? 60) * 1000;
          this.logger.warn(`QB rate limited, retrying in ${retryAfter}ms (attempt ${attempt})`);
          await new Promise((r) => setTimeout(r, retryAfter));
          return this.request<T>(accessToken, config, attempt + 1);
        }
        if (status === 503 && attempt <= MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          return this.request<T>(accessToken, config, attempt + 1);
        }
        const detail = (err.response?.data as { Fault?: { Error?: { Message?: string }[] } })?.Fault?.Error?.[0]?.Message ?? err.message;
        throw new ServiceUnavailableException(`QuickBooks API error: ${detail}`);
      }
      throw err;
    }
  }
}
