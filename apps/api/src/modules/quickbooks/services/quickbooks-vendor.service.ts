import { Injectable, Logger } from "@nestjs/common";
import { QBSyncOperation, QBSyncStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksClientService } from "./quickbooks-client.service";
import { QuickBooksLoggerService } from "./quickbooks-logger.service";

interface QBVendor {
  Id?: string;
  SyncToken?: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: { Line1?: string };
  TaxIdentifier?: string;
  Active: boolean;
}

@Injectable()
export class QuickBooksVendorService {
  private readonly logger = new Logger(QuickBooksVendorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QuickBooksClientService,
    private readonly qbLogger: QuickBooksLoggerService
  ) {}

  async syncAll(companyId: string, triggeredById?: string): Promise<void> {
    const conn = await this.qbLogger.getConnection(companyId);
    if (!conn?.isActive) return;

    const logId = await this.qbLogger.begin({ companyId, connectionId: conn.id, operation: QBSyncOperation.VENDOR_SYNC, triggeredById });
    const suppliers = await this.prisma.supplier.findMany({
      where: { companyId, deletedAt: null, qbSyncStatus: { in: [QBSyncStatus.NOT_SYNCED, QBSyncStatus.FAILED] } }
    });

    let succeeded = 0;
    let failed = 0;
    for (const supplier of suppliers) {
      try {
        await this.syncOne(companyId, supplier.id);
        succeeded++;
      } catch (err) {
        failed++;
        this.logger.warn(`Failed to sync supplier ${supplier.id}: ${(err as Error).message}`);
      }
    }

    if (failed === 0) {
      await this.qbLogger.succeed(logId, { recordsProcessed: suppliers.length, recordsSucceeded: succeeded });
    } else {
      await this.qbLogger.partial(logId, { recordsProcessed: suppliers.length, recordsSucceeded: succeeded, recordsFailed: failed });
    }
  }

  async syncOne(companyId: string, supplierId: string): Promise<void> {
    const supplier = await this.prisma.supplier.findFirstOrThrow({ where: { id: supplierId, companyId, deletedAt: null } });

    await this.prisma.supplier.update({ where: { id: supplierId }, data: { qbSyncStatus: QBSyncStatus.PENDING } });

    try {
      const payload: QBVendor = {
        DisplayName: supplier.name,
        CompanyName: supplier.name,
        Active: supplier.status === "ACTIVE",
        ...(supplier.email && { PrimaryEmailAddr: { Address: supplier.email } }),
        ...(supplier.phone && { PrimaryPhone: { FreeFormNumber: supplier.phone } }),
        ...(supplier.address && { BillAddr: { Line1: supplier.address } }),
        ...(supplier.taxId && { TaxIdentifier: supplier.taxId })
      };

      let qbId = supplier.qbVendorId;

      if (qbId) {
        const existing = await this.findQBVendorById(companyId, qbId);
        if (existing) {
          await this.client.post(companyId, "vendor", { ...payload, Id: qbId, SyncToken: existing.SyncToken, sparse: true });
        } else {
          qbId = await this.createQBVendor(companyId, payload);
        }
      } else {
        const existingByName = await this.findQBVendorByDisplayName(companyId, supplier.name);
        if (existingByName) {
          qbId = existingByName.Id!;
          this.logger.log(`Vendor "${supplier.name}" already exists in QB with Id ${qbId}, linking`);
        } else {
          qbId = await this.createQBVendor(companyId, payload);
        }
      }

      await this.prisma.supplier.update({
        where: { id: supplierId },
        data: { qbVendorId: qbId, qbSyncStatus: QBSyncStatus.SYNCED, qbLastSyncAt: new Date(), qbSyncError: null }
      });
    } catch (err) {
      await this.prisma.supplier.update({
        where: { id: supplierId },
        data: { qbSyncStatus: QBSyncStatus.FAILED, qbSyncError: (err as Error).message.slice(0, 500) }
      });
      throw err;
    }
  }

  private async createQBVendor(companyId: string, payload: QBVendor): Promise<string> {
    const resp = await this.client.post<{ Vendor: QBVendor & { Id: string } }>(companyId, "vendor", payload);
    return resp.Vendor.Id!;
  }

  private async findQBVendorById(companyId: string, qbId: string): Promise<(QBVendor & { Id: string; SyncToken: string }) | null> {
    try {
      const resp = await this.client.get<{ Vendor: QBVendor & { Id: string; SyncToken: string } }>(companyId, `vendor/${qbId}`);
      return resp.Vendor;
    } catch {
      return null;
    }
  }

  private async findQBVendorByDisplayName(companyId: string, name: string): Promise<(QBVendor & { Id: string }) | null> {
    try {
      const escaped = name.replace(/'/g, "\\'");
      const resp = await this.client.query<{ QueryResponse: { Vendor?: Array<QBVendor & { Id: string }> } }>(companyId, `SELECT Id, DisplayName FROM Vendor WHERE DisplayName = '${escaped}'`);
      return resp.QueryResponse.Vendor?.[0] ?? null;
    } catch {
      return null;
    }
  }
}
