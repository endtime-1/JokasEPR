import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QBWebhookStatus } from "@prisma/client";
import { createHmac } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

interface QBWebhookPayload {
  eventNotifications: Array<{
    realmId: string;
    dataChangeEvent: {
      entities: Array<{
        name: string;
        id: string;
        operation: string;
        lastUpdated: string;
      }>;
    };
  }>;
}

@Injectable()
export class QuickBooksWebhookService {
  private readonly logger = new Logger(QuickBooksWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  verifySignature(rawBody: Buffer, signature: string): void {
    const verifierToken = this.config.get<string>("QB_WEBHOOK_VERIFIER_TOKEN");
    if (!verifierToken) {
      this.logger.warn("QB_WEBHOOK_VERIFIER_TOKEN not configured — skipping webhook verification");
      return;
    }
    const hash = createHmac("sha256", verifierToken).update(rawBody).digest("base64");
    if (hash !== signature) throw new ForbiddenException("Invalid webhook signature");
  }

  async processPayload(rawBody: Buffer, signature: string): Promise<void> {
    this.verifySignature(rawBody, signature);

    let payload: QBWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as QBWebhookPayload;
    } catch {
      this.logger.warn("Received invalid JSON webhook payload");
      return;
    }

    for (const notification of payload.eventNotifications ?? []) {
      const { realmId, dataChangeEvent } = notification;
      const connection = await this.prisma.quickBooksConnection.findFirst({ where: { realmId, isActive: true } });

      for (const entity of dataChangeEvent?.entities ?? []) {
        await this.prisma.quickBooksWebhookEvent.create({
          data: {
            connectionId: connection?.id,
            realmId,
            entityType: entity.name,
            entityId: entity.id,
            operation: entity.operation,
            eventDate: new Date(entity.lastUpdated),
            rawPayload: { entity, realmId } as object,
            status: QBWebhookStatus.PENDING
          }
        });
      }
    }

    // Process pending events asynchronously
    setImmediate(() => this.processPendingEvents().catch((err: unknown) => this.logger.error("Webhook processing error", (err as Error).message)));
  }

  async processPendingEvents(): Promise<void> {
    const events = await this.prisma.quickBooksWebhookEvent.findMany({
      where: { status: QBWebhookStatus.PENDING },
      take: 50,
      orderBy: { receivedAt: "asc" }
    });

    for (const event of events) {
      await this.prisma.quickBooksWebhookEvent.update({ where: { id: event.id }, data: { status: QBWebhookStatus.PROCESSING } });
      try {
        // Webhook events mark ERP records as needing re-sync when QB is the source of truth for that change.
        // For our use case (ERP is the operational system), we primarily log these for visibility.
        await this.prisma.quickBooksWebhookEvent.update({
          where: { id: event.id },
          data: { status: QBWebhookStatus.PROCESSED, processedAt: new Date() }
        });
      } catch (err) {
        await this.prisma.quickBooksWebhookEvent.update({
          where: { id: event.id },
          data: {
            status: event.retryCount >= 3 ? QBWebhookStatus.FAILED : QBWebhookStatus.PENDING,
            retryCount: { increment: 1 },
            errorMessage: (err as Error).message.slice(0, 2000)
          }
        });
      }
    }
  }

  async getWebhookEvents(companyId: string, status?: QBWebhookStatus, limit = 50) {
    const connection = await this.prisma.quickBooksConnection.findUnique({ where: { companyId } });
    if (!connection) return [];
    return this.prisma.quickBooksWebhookEvent.findMany({
      where: { connectionId: connection.id, ...(status && { status }) },
      orderBy: { receivedAt: "desc" },
      take: limit
    });
  }
}
