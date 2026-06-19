import { Injectable, Logger } from "@nestjs/common";
import { QBSyncOperation, QBSyncStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksClientService } from "./quickbooks-client.service";
import { QuickBooksLoggerService } from "./quickbooks-logger.service";

interface QBCustomer {
  Id?: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: { Line1?: string; City?: string; Country?: string };
  Active: boolean;
}

@Injectable()
export class QuickBooksCustomerService {
  private readonly logger = new Logger(QuickBooksCustomerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QuickBooksClientService,
    private readonly qbLogger: QuickBooksLoggerService
  ) {}

  async syncAll(companyId: string, triggeredById?: string): Promise<void> {
    const conn = await this.qbLogger.getConnection(companyId);
    if (!conn?.isActive) return;

    const logId = await this.qbLogger.begin({ companyId, connectionId: conn.id, operation: QBSyncOperation.CUSTOMER_SYNC, triggeredById });
    const customers = await this.prisma.customer.findMany({
      where: { companyId, deletedAt: null, qbSyncStatus: { in: [QBSyncStatus.NOT_SYNCED, QBSyncStatus.FAILED] } }
    });

    let succeeded = 0;
    let failed = 0;
    for (const customer of customers) {
      try {
        await this.syncOne(companyId, customer.id);
        succeeded++;
      } catch (err) {
        failed++;
        this.logger.warn(`Failed to sync customer ${customer.id}: ${(err as Error).message}`);
      }
    }

    if (failed === 0) {
      await this.qbLogger.succeed(logId, { recordsProcessed: customers.length, recordsSucceeded: succeeded });
    } else {
      await this.qbLogger.partial(logId, { recordsProcessed: customers.length, recordsSucceeded: succeeded, recordsFailed: failed });
    }
  }

  async syncOne(companyId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirstOrThrow({ where: { id: customerId, companyId, deletedAt: null } });

    await this.prisma.customer.update({ where: { id: customerId }, data: { qbSyncStatus: QBSyncStatus.PENDING } });

    try {
      const payload: QBCustomer = {
        DisplayName: customer.name,
        CompanyName: customer.name,
        Active: customer.status === "ACTIVE",
        ...(customer.email && { PrimaryEmailAddr: { Address: customer.email } }),
        ...(customer.phone && { PrimaryPhone: { FreeFormNumber: customer.phone } }),
        ...(customer.address && { BillAddr: { Line1: customer.address } })
      };

      let qbId = customer.qbCustomerId;

      if (qbId) {
        const existing = await this.findQBCustomerById(companyId, qbId);
        if (existing) {
          await this.client.post(companyId, "customer", { ...payload, Id: qbId, SyncToken: existing.SyncToken, sparse: true });
        } else {
          qbId = await this.createQBCustomer(companyId, payload);
        }
      } else {
        const existingByName = await this.findQBCustomerByDisplayName(companyId, customer.name);
        if (existingByName) {
          qbId = existingByName.Id!;
          this.logger.log(`Customer "${customer.name}" already exists in QB with Id ${qbId}, linking`);
        } else {
          qbId = await this.createQBCustomer(companyId, payload);
        }
      }

      await this.prisma.customer.update({
        where: { id: customerId },
        data: { qbCustomerId: qbId, qbSyncStatus: QBSyncStatus.SYNCED, qbLastSyncAt: new Date(), qbSyncError: null }
      });
    } catch (err) {
      await this.prisma.customer.update({
        where: { id: customerId },
        data: { qbSyncStatus: QBSyncStatus.FAILED, qbSyncError: (err as Error).message.slice(0, 500) }
      });
      throw err;
    }
  }

  private async createQBCustomer(companyId: string, payload: QBCustomer): Promise<string> {
    const resp = await this.client.post<{ Customer: QBCustomer & { Id: string } }>(companyId, "customer", payload);
    return resp.Customer.Id;
  }

  private async findQBCustomerById(companyId: string, qbId: string): Promise<(QBCustomer & { Id: string; SyncToken: string }) | null> {
    try {
      const resp = await this.client.get<{ Customer: QBCustomer & { Id: string; SyncToken: string } }>(companyId, `customer/${qbId}`);
      return resp.Customer;
    } catch {
      return null;
    }
  }

  private async findQBCustomerByDisplayName(companyId: string, name: string): Promise<(QBCustomer & { Id: string }) | null> {
    try {
      const escaped = name.replace(/'/g, "\\'");
      const resp = await this.client.query<{ QueryResponse: { Customer?: Array<QBCustomer & { Id: string }> } }>(companyId, `SELECT Id, DisplayName FROM Customer WHERE DisplayName = '${escaped}'`);
      return resp.QueryResponse.Customer?.[0] ?? null;
    } catch {
      return null;
    }
  }
}
