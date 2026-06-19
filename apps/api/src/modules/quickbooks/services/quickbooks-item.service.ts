import { Injectable, Logger } from "@nestjs/common";
import { QBSyncOperation, QBSyncStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksClientService } from "./quickbooks-client.service";
import { QuickBooksLoggerService } from "./quickbooks-logger.service";

type QBItemType = "Inventory" | "NonInventory" | "Service";

interface QBItem {
  Id?: string;
  SyncToken?: string;
  Name: string;
  Description?: string;
  Active: boolean;
  Type: QBItemType;
  IncomeAccountRef?: { value: string };
  ExpenseAccountRef?: { value: string };
  AssetAccountRef?: { value: string };
}

@Injectable()
export class QuickBooksItemService {
  private readonly logger = new Logger(QuickBooksItemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QuickBooksClientService,
    private readonly qbLogger: QuickBooksLoggerService
  ) {}

  async syncAll(companyId: string, triggeredById?: string): Promise<void> {
    const conn = await this.qbLogger.getConnection(companyId);
    if (!conn?.isActive) return;

    const logId = await this.qbLogger.begin({ companyId, connectionId: conn.id, operation: QBSyncOperation.ITEM_SYNC, triggeredById });
    const products = await this.prisma.product.findMany({
      where: { companyId, deletedAt: null, qbSyncStatus: { in: [QBSyncStatus.NOT_SYNCED, QBSyncStatus.FAILED] } }
    });

    let succeeded = 0;
    let failed = 0;
    for (const product of products) {
      try {
        await this.syncOne(companyId, product.id);
        succeeded++;
      } catch (err) {
        failed++;
        this.logger.warn(`Failed to sync product ${product.id}: ${(err as Error).message}`);
      }
    }

    if (failed === 0) {
      await this.qbLogger.succeed(logId, { recordsProcessed: products.length, recordsSucceeded: succeeded });
    } else {
      await this.qbLogger.partial(logId, { recordsProcessed: products.length, recordsSucceeded: succeeded, recordsFailed: failed });
    }
  }

  async syncOne(companyId: string, productId: string): Promise<void> {
    const product = await this.prisma.product.findFirstOrThrow({ where: { id: productId, companyId, deletedAt: null } });

    await this.prisma.product.update({ where: { id: productId }, data: { qbSyncStatus: QBSyncStatus.PENDING } });

    try {
      const qbType = this.mapProductType(product.type as string);
      const payload: QBItem = {
        Name: product.name,
        Description: product.description ?? undefined,
        Active: product.status === "ACTIVE",
        Type: qbType,
        ...(product.qbIncomeAccountId && { IncomeAccountRef: { value: product.qbIncomeAccountId } }),
        ...(product.qbExpenseAccountId && { ExpenseAccountRef: { value: product.qbExpenseAccountId } }),
        ...(product.qbAssetAccountId && qbType === "Inventory" && { AssetAccountRef: { value: product.qbAssetAccountId } })
      };

      let qbId = product.qbItemId;

      if (qbId) {
        const existing = await this.findQBItemById(companyId, qbId);
        if (existing) {
          await this.client.post(companyId, "item", { ...payload, Id: qbId, SyncToken: existing.SyncToken, sparse: true });
        } else {
          qbId = await this.createQBItem(companyId, payload);
        }
      } else {
        const existingByName = await this.findQBItemByName(companyId, product.name);
        if (existingByName) {
          qbId = existingByName.Id!;
          this.logger.log(`Item "${product.name}" already exists in QB with Id ${qbId}, linking`);
        } else {
          qbId = await this.createQBItem(companyId, payload);
        }
      }

      await this.prisma.product.update({
        where: { id: productId },
        data: { qbItemId: qbId, qbSyncStatus: QBSyncStatus.SYNCED, qbLastSyncAt: new Date(), qbSyncError: null }
      });
    } catch (err) {
      await this.prisma.product.update({
        where: { id: productId },
        data: { qbSyncStatus: QBSyncStatus.FAILED, qbSyncError: (err as Error).message.slice(0, 500) }
      });
      throw err;
    }
  }

  private mapProductType(type: string): QBItemType {
    if (type === "SERVICE") return "Service";
    if (type === "RAW_MATERIAL") return "Inventory";
    return "NonInventory";
  }

  private async createQBItem(companyId: string, payload: QBItem): Promise<string> {
    const resp = await this.client.post<{ Item: QBItem & { Id: string } }>(companyId, "item", payload);
    return resp.Item.Id!;
  }

  private async findQBItemById(companyId: string, qbId: string): Promise<(QBItem & { Id: string; SyncToken: string }) | null> {
    try {
      const resp = await this.client.get<{ Item: QBItem & { Id: string; SyncToken: string } }>(companyId, `item/${qbId}`);
      return resp.Item;
    } catch {
      return null;
    }
  }

  private async findQBItemByName(companyId: string, name: string): Promise<(QBItem & { Id: string }) | null> {
    try {
      const escaped = name.replace(/'/g, "\\'");
      const resp = await this.client.query<{ QueryResponse: { Item?: Array<QBItem & { Id: string }> } }>(companyId, `SELECT Id, Name FROM Item WHERE Name = '${escaped}'`);
      return resp.QueryResponse.Item?.[0] ?? null;
    } catch {
      return null;
    }
  }
}
