import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { FinAccountType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { FIN_ACCOUNT_ROLES, FIN_CHART_TEMPLATE } from "./fin-chart-template";
import { FIN_DOC_TYPES } from "./fin-numbering.service";
import { CreateFinAccountDto, UpdateFinAccountDto } from "./dto/fin.dto";

@Injectable()
export class FinAccountsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: FinAuditService) {}

  /** Every account with whether it has postings (those can no longer change code, type or heading status). */
  async list(companyId: string, opts: { includeInactive?: boolean } = {}) {
    const accounts = await this.prisma.finAccount.findMany({
      where: { companyId, ...(opts.includeInactive === false ? { isActive: true } : {}) },
      orderBy: { code: "asc" }
    });
    const used = await this.prisma.finJournalLine.groupBy({
      by: ["accountId"],
      where: { journalEntry: { companyId } },
      _count: { _all: true }
    });
    const usedIds = new Set(used.map((u) => u.accountId));
    return accounts.map((a) => ({ ...a, hasPostings: usedIds.has(a.id) }));
  }

  roles(companyId: string) {
    return this.prisma.finAccount
      .findMany({ where: { companyId, systemRole: { not: null } }, select: { id: true, code: true, name: true, systemRole: true } })
      .then((assigned) => {
        const byRole = new Map(assigned.map((a) => [a.systemRole as string, a]));
        return Object.entries(FIN_ACCOUNT_ROLES).map(([role, def]) => ({
          role,
          label: def.label,
          type: def.type,
          account: byRole.get(role) ? { id: byRole.get(role)!.id, code: byRole.get(role)!.code, name: byRole.get(role)!.name } : null
        }));
      });
  }

  async create(companyId: string, userId: string, dto: CreateFinAccountDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCodeFree(tx, companyId, dto.code);
      if (dto.parentId) await this.assertValidParent(tx, companyId, dto.parentId, dto.type);
      if (dto.systemRole) await this.assertRoleOk(tx, companyId, dto.systemRole, dto.type, undefined);
      const account = await tx.finAccount.create({
        data: {
          companyId,
          code: dto.code.trim(),
          name: dto.name.trim(),
          type: dto.type,
          parentId: dto.parentId ?? null,
          isPostable: dto.isPostable ?? true,
          systemRole: dto.systemRole ?? null,
          description: dto.description ?? null,
          externalRef: dto.externalRef ?? null,
          createdById: userId
        }
      });
      await this.audit.write(
        { companyId, userId, area: "accounting", action: "CREATE_ACCOUNT", entityType: "FinAccount", entityId: account.id, summary: `Created account ${account.code} ${account.name}`, after: accountShape(account), ...meta },
        tx
      );
      return account;
    });
  }

  async update(companyId: string, userId: string, id: string, dto: UpdateFinAccountDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.finAccount.findFirst({ where: { id, companyId } });
      if (!current) throw new NotFoundException("Account not found.");
      const postings = await tx.finJournalLine.count({ where: { accountId: id } });

      if (postings > 0) {
        // Postings reference the account's meaning; changing it would change history.
        if (dto.code !== undefined && dto.code !== current.code) throw new BadRequestException("This account has postings, so its code cannot change. Rename it or create a new account.");
        if (dto.type !== undefined && dto.type !== current.type) throw new BadRequestException("This account has postings, so its type cannot change.");
        if (dto.isPostable === false) throw new BadRequestException("This account has postings, so it cannot become a heading.");
      }
      const nextType = (dto.type ?? current.type) as FinAccountType;
      if (dto.code !== undefined && dto.code !== current.code) await this.assertCodeFree(tx, companyId, dto.code);
      if (dto.parentId) {
        if (dto.parentId === id) throw new BadRequestException("An account cannot be its own parent.");
        await this.assertValidParent(tx, companyId, dto.parentId, nextType);
        await this.assertNoCycle(tx, companyId, id, dto.parentId);
      }
      if (dto.systemRole) await this.assertRoleOk(tx, companyId, dto.systemRole, nextType, id);
      if (dto.isPostable === false) {
        // A heading cannot also fill a ledger role.
        const role = dto.systemRole === undefined ? current.systemRole : dto.systemRole;
        if (role) throw new BadRequestException("An account that fills a ledger role must stay a posting account.");
      }
      if (dto.isActive === false) {
        if (current.systemRole) throw new BadRequestException(`This account is the "${FIN_ACCOUNT_ROLES[current.systemRole]?.label ?? current.systemRole}" account the ledger posts to. Give that role to another account first.`);
        const children = await tx.finAccount.count({ where: { parentId: id, isActive: true } });
        if (children > 0) throw new BadRequestException("Deactivate the accounts under this heading first.");
      }

      const updated = await tx.finAccount.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
          ...(dto.isPostable !== undefined ? { isPostable: dto.isPostable } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.systemRole !== undefined ? { systemRole: dto.systemRole } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.externalRef !== undefined ? { externalRef: dto.externalRef } : {}),
          updatedById: userId
        }
      });
      await this.audit.write(
        { companyId, userId, area: "accounting", action: "UPDATE_ACCOUNT", entityType: "FinAccount", entityId: id, summary: `Updated account ${updated.code} ${updated.name}`, before: accountShape(current), after: accountShape(updated), ...meta },
        tx
      );
      return updated;
    });
  }

  /** Loads the poultry and feed chart. Only into an empty chart, so it can never collide with real data. */
  async applyTemplate(companyId: string, userId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.finAccount.count({ where: { companyId } });
      if (existing > 0) throw new ConflictException("The chart of accounts is not empty, so the template cannot be applied.");
      const idByCode = new Map<string, string>();
      // Template is ordered parents-first.
      for (const t of FIN_CHART_TEMPLATE) {
        const created = await tx.finAccount.create({
          data: {
            companyId,
            code: t.code,
            name: t.name,
            type: t.type,
            parentId: t.parent ? idByCode.get(t.parent) ?? null : null,
            isPostable: t.postable ?? true,
            isActive: t.active ?? true,
            systemRole: t.role ?? null,
            description: t.description ?? null,
            createdById: userId
          }
        });
        idByCode.set(t.code, created.id);
      }
      // Numbering rows exist from day one, so the first postings never have to create them.
      for (const [docType, def] of Object.entries(FIN_DOC_TYPES)) {
        await tx.finNumberSequence.upsert({ where: { companyId_docType: { companyId, docType } }, update: {}, create: { companyId, docType, prefix: def.prefix } });
      }
      await this.audit.write(
        { companyId, userId, area: "accounting", action: "APPLY_TEMPLATE", entityType: "FinAccount", summary: `Applied the poultry and feed chart of accounts (${FIN_CHART_TEMPLATE.length} accounts)`, ...meta },
        tx
      );
      return { created: FIN_CHART_TEMPLATE.length };
    });
  }

  // ─── rules ──────────────────────────────────────────────────────────────────

  private async assertCodeFree(tx: FinDb, companyId: string, code: string) {
    const dup = await tx.finAccount.findFirst({ where: { companyId, code: code.trim() }, select: { id: true } });
    if (dup) throw new ConflictException(`Account code ${code} is already used.`);
  }

  private async assertValidParent(tx: FinDb, companyId: string, parentId: string, type: FinAccountType) {
    const parent = await tx.finAccount.findFirst({ where: { id: parentId, companyId } });
    if (!parent) throw new BadRequestException("The parent account does not exist.");
    if (parent.isPostable) throw new BadRequestException(`${parent.code} ${parent.name} is a posting account. Only a heading can have accounts under it.`);
    if (parent.type !== type) throw new BadRequestException("An account must be the same type as the heading it sits under.");
  }

  private async assertNoCycle(tx: FinDb, companyId: string, id: string, newParentId: string) {
    let cursor: string | null = newParentId;
    for (let i = 0; i < 50 && cursor; i++) {
      if (cursor === id) throw new BadRequestException("That would make the account its own ancestor.");
      const row: { parentId: string | null } | null = await tx.finAccount.findFirst({ where: { id: cursor, companyId }, select: { parentId: true } });
      cursor = row?.parentId ?? null;
    }
  }

  private async assertRoleOk(tx: FinDb, companyId: string, role: string, type: FinAccountType, selfId: string | undefined) {
    const def = FIN_ACCOUNT_ROLES[role];
    if (!def) throw new BadRequestException(`Unknown account role "${role}".`);
    if (def.type !== type) throw new BadRequestException(`The "${def.label}" role needs a ${def.type.toLowerCase()} account.`);
    const holder = await tx.finAccount.findFirst({ where: { companyId, systemRole: role, ...(selfId ? { id: { not: selfId } } : {}) }, select: { code: true, name: true } });
    if (holder) throw new ConflictException(`"${def.label}" is already set on ${holder.code} ${holder.name}. Clear it there first.`);
  }
}

function accountShape(a: { code: string; name: string; type: string; parentId: string | null; isPostable: boolean; isActive: boolean; systemRole: string | null }): Prisma.InputJsonValue {
  return { code: a.code, name: a.name, type: a.type, parentId: a.parentId, isPostable: a.isPostable, isActive: a.isActive, systemRole: a.systemRole };
}
