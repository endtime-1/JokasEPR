import { Injectable } from "@nestjs/common";
import { QBMappingType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QuickBooksClientService } from "./quickbooks-client.service";

@Injectable()
export class QuickBooksMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QuickBooksClientService
  ) {}

  async upsertMapping(
    companyId: string,
    connectionId: string,
    mappingType: QBMappingType,
    erpEntityId: string | null,
    erpEntityName: string,
    qbEntityId: string,
    qbEntityName: string
  ) {
    return this.prisma.quickBooksMapping.upsert({
      where: { connectionId_mappingType_erpEntityId: { connectionId, mappingType, erpEntityId: erpEntityId ?? "" } },
      create: { companyId, connectionId, mappingType, erpEntityId: erpEntityId ?? undefined, erpEntityName, qbEntityId, qbEntityName },
      update: { qbEntityId, qbEntityName, erpEntityName }
    });
  }

  async getMappings(companyId: string, mappingType?: QBMappingType) {
    return this.prisma.quickBooksMapping.findMany({
      where: { companyId, ...(mappingType && { mappingType }) },
      orderBy: { mappingType: "asc" }
    });
  }

  async getQBAccountForCategory(companyId: string, categoryId: string): Promise<string | null> {
    const mapping = await this.prisma.quickBooksMapping.findFirst({
      where: { companyId, mappingType: QBMappingType.EXPENSE_ACCOUNT, erpEntityId: categoryId }
    });
    return mapping?.qbEntityId ?? null;
  }

  async listQBAccounts(companyId: string): Promise<Array<{ id: string; name: string; type: string; subType: string }>> {
    const resp = await this.client.query<{ QueryResponse: { Account?: Array<{ Id: string; Name: string; AccountType: string; AccountSubType: string }> } }>(
      companyId,
      "SELECT Id, Name, AccountType, AccountSubType FROM Account WHERE Active = true MAXRESULTS 200"
    );
    return (resp.QueryResponse.Account ?? []).map((a) => ({ id: a.Id, name: a.Name, type: a.AccountType, subType: a.AccountSubType }));
  }

  async deleteMapping(id: string, companyId: string) {
    return this.prisma.quickBooksMapping.deleteMany({ where: { id, companyId } });
  }
}
