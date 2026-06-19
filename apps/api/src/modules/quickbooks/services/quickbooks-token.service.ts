import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class QuickBooksTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  private getKey(): Buffer {
    const hex = this.config.get<string>("QB_TOKEN_ENCRYPTION_KEY");
    if (!hex || hex.length !== 64) {
      throw new InternalServerErrorException("QB_TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
    }
    return Buffer.from(hex, "hex");
  }

  encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  decrypt(enc: string): string {
    const key = this.getKey();
    const parts = enc.split(":");
    if (parts.length !== 3) throw new InternalServerErrorException("Invalid encrypted token format");
    const [ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString("utf8") + decipher.final("utf8");
  }

  async storeTokens(
    connectionId: string,
    accessToken: string,
    refreshToken: string,
    accessExpiresAt: Date,
    refreshExpiresAt: Date
  ): Promise<void> {
    const accessTokenEnc = this.encrypt(accessToken);
    const refreshTokenEnc = this.encrypt(refreshToken);

    await this.prisma.quickBooksToken.upsert({
      where: { connectionId },
      create: { connectionId, accessTokenEnc, refreshTokenEnc, accessTokenExpiresAt: accessExpiresAt, refreshTokenExpiresAt: refreshExpiresAt },
      update: { accessTokenEnc, refreshTokenEnc, accessTokenExpiresAt: accessExpiresAt, refreshTokenExpiresAt: refreshExpiresAt }
    });
  }

  async getDecryptedTokens(connectionId: string): Promise<{ accessToken: string; refreshToken: string; accessTokenExpiresAt: Date; refreshTokenExpiresAt: Date } | null> {
    const token = await this.prisma.quickBooksToken.findUnique({ where: { connectionId } });
    if (!token) return null;
    return {
      accessToken: this.decrypt(token.accessTokenEnc),
      refreshToken: this.decrypt(token.refreshTokenEnc),
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt
    };
  }

  async isAccessTokenExpired(connectionId: string): Promise<boolean> {
    const token = await this.prisma.quickBooksToken.findUnique({ where: { connectionId }, select: { accessTokenExpiresAt: true } });
    if (!token) return true;
    // Treat as expired 2 minutes before actual expiry to avoid edge cases
    return token.accessTokenExpiresAt.getTime() - 120_000 < Date.now();
  }

  async deleteTokens(connectionId: string): Promise<void> {
    await this.prisma.quickBooksToken.deleteMany({ where: { connectionId } });
  }
}
