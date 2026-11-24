import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ContactQueryDto, CreateContactDto, UpdateContactDto } from "./dto/fin.dto";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { parseCsvObjects, toCsv } from "./fin-csv";
import { pesewasToDecimal, toPesewas } from "./fin-money";
import { FinNumberingService } from "./fin-numbering.service";

// ─── normalising (pure, exported for tests) ──────────────────────────────────

/** Ghana-aware phone clean-up. 0244123456, 244123456, 233244123456, +233 24 412 3456 -> +233244123456. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^[+\d\s().-]+$/.test(trimmed)) throw new BadRequestException("A phone number can only contain digits, spaces and + ( ) . -");
  let digits = trimmed.replace(/\D/g, "");
  const plus = trimmed.startsWith("+");
  if (!plus && digits.startsWith("00")) {
    digits = digits.slice(2);
    return finishPhone(digits, true);
  }
  if (plus) return finishPhone(digits, true);
  if (digits.startsWith("233") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+233${digits.slice(1)}`;
  if (digits.length === 9) return `+233${digits}`;
  return finishPhone(digits, false);
}

function finishPhone(digits: string, international: boolean): string {
  if (digits.length < 7 || digits.length > 15) throw new BadRequestException("That phone number has the wrong number of digits.");
  return international ? `+${digits}` : digits;
}

/** Case, spacing and punctuation-insensitive name key used to spot duplicates. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Phones are stored as +233244123456, so a search typed as 0244 123 456 must match on the last 9 digits. */
function phoneSearch(term: string): Prisma.FinContactWhereInput[] {
  const digits = term.replace(/\D/g, "");
  return /^[+\d\s().-]+$/.test(term) && digits.length >= 5 ? [{ phone: { contains: digits.slice(-9) } }] : [];
}

function blank(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

type ContactRow = Awaited<ReturnType<PrismaService["finContact"]["findFirstOrThrow"]>>;

type Duplicate = { id: string; code: string; name: string; matchedOn: string[] };

// ─── import columns ──────────────────────────────────────────────────────────

export const CONTACT_CSV_HEADERS = ["code", "name", "type", "contact_person", "phone", "email", "tin", "address_line1", "address_line2", "city", "region", "payment_terms_days", "credit_limit", "notes", "external_ref"];

const CSV_ALIASES: Record<string, string> = {
  contact_name: "name", company: "name", business_name: "name", customer_name: "name", supplier_name: "name",
  contact_type: "type", kind: "type",
  contact: "contact_person", contact_name_person: "contact_person",
  tel: "phone", telephone: "phone", mobile: "phone", phone_number: "phone",
  e_mail: "email", email_address: "email",
  tax_id: "tin", tin_number: "tin", tax_number: "tin",
  address: "address_line1", address_1: "address_line1", address1: "address_line1", address_2: "address_line2", address2: "address_line2",
  town: "city", terms: "payment_terms_days", payment_terms: "payment_terms_days", credit: "credit_limit",
  reference: "external_ref", ref: "external_ref", customer_code: "code", supplier_code: "code"
};

type ImportPlan = {
  line: number;
  action: "create" | "update" | "error";
  errors: string[];
  name: string;
  code: string | null;
  matchedId?: string;
  matchedBy?: "code" | "external_ref" | "name+phone";
  data: Partial<{
    code: string; name: string; isCustomer: boolean; isSupplier: boolean; contactPerson: string; phone: string; email: string; tin: string;
    addressLine1: string; addressLine2: string; city: string; region: string; paymentTermsDays: number; creditLimit: string; notes: string; externalRef: string;
  }>;
};

@Injectable()
export class FinContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly numbering: FinNumberingService
  ) {}

  // ─── reading ────────────────────────────────────────────────────────────────

  async list(companyId: string, q: ContactQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const search = q.search?.trim();
    const where: Prisma.FinContactWhereInput = {
      companyId,
      ...(q.type === "customer" ? { isCustomer: true } : q.type === "supplier" ? { isSupplier: true } : {}),
      ...(q.activeOnly ? { isActive: true } : {}),
      ...(search
        ? { OR: [{ name: { contains: search } }, { code: { contains: search } }, { phone: { contains: search } }, { email: { contains: search } }, { tin: { contains: search } }, ...phoneSearch(search)] }
        : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.finContact.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * take, take }),
      this.prisma.finContact.count({ where })
    ]);
    return { rows: rows.map(present), total, page, take };
  }

  async get(companyId: string, id: string) {
    const c = await this.prisma.finContact.findFirst({ where: { id, companyId } });
    if (!c) throw new NotFoundException("Contact not found.");
    return present(c);
  }

  // ─── create / update ────────────────────────────────────────────────────────

  async create(companyId: string, userId: string, dto: CreateContactDto, meta: RequestMeta) {
    const isCustomer = dto.isCustomer ?? (dto.isSupplier ? false : true);
    const isSupplier = dto.isSupplier ?? false;
    if (!isCustomer && !isSupplier) throw new BadRequestException("A contact must be a customer, a supplier, or both.");
    const fields = this.cleanFields(dto);
    const name = dto.name.trim();

    return this.prisma.$transaction(async (tx) => {
      if (!dto.confirmDuplicate) await this.assertNoDuplicate(tx, companyId, { name, phone: fields.phone, tin: fields.tin });
      const code = dto.code ? await this.requireFreeCode(tx, companyId, dto.code) : await this.nextFreeCode(tx, companyId, isCustomer);
      const created = await tx.finContact.create({
        data: { companyId, code, name, isCustomer, isSupplier, ...fields, createdById: userId }
      });
      await this.audit.write(
        { companyId, userId, area: "contacts", action: "CREATE", entityType: "FinContact", entityId: created.id, summary: `Created ${kind(created)} ${created.code} ${created.name}`, after: auditShape(created), ...meta },
        tx
      );
      return present(created);
    });
  }

  async update(companyId: string, userId: string, id: string, dto: UpdateContactDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.finContact.findFirst({ where: { id, companyId } });
      if (!current) throw new NotFoundException("Contact not found.");
      const isCustomer = dto.isCustomer ?? current.isCustomer;
      const isSupplier = dto.isSupplier ?? current.isSupplier;
      if (!isCustomer && !isSupplier) throw new BadRequestException("A contact must be a customer, a supplier, or both.");
      const fields = this.cleanFields(dto, true);
      const name = dto.name !== undefined ? dto.name.trim() : current.name;
      const nameChanged = nameKey(name) !== nameKey(current.name);
      const phoneChanged = fields.phone !== undefined && fields.phone !== current.phone;
      const tinChanged = fields.tin !== undefined && fields.tin !== current.tin;
      if (!dto.confirmDuplicate && (nameChanged || phoneChanged || tinChanged)) {
        await this.assertNoDuplicate(tx, companyId, { name: nameChanged ? name : "", phone: phoneChanged ? fields.phone ?? null : null, tin: tinChanged ? fields.tin ?? null : null }, id);
      }
      const updated = await tx.finContact.update({
        where: { id },
        data: { name, isCustomer, isSupplier, ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}), ...fields, updatedById: userId }
      });
      await this.audit.write(
        { companyId, userId, area: "contacts", action: "UPDATE", entityType: "FinContact", entityId: id, summary: `Updated ${kind(updated)} ${updated.code} ${updated.name}`, before: auditShape(current), after: auditShape(updated), ...meta },
        tx
      );
      return present(updated);
    });
  }

  /** Validates and normalises the optional columns. Only keys that were sent are returned (partial updates). */
  private cleanFields(dto: Partial<CreateContactDto & UpdateContactDto>, partial = false) {
    const out: Record<string, unknown> = {};
    const has = (k: keyof typeof dto) => !partial || dto[k] !== undefined;
    if (has("contactPerson")) out.contactPerson = blank(dto.contactPerson);
    if (has("phone")) out.phone = normalizePhone(dto.phone);
    if (has("email")) {
      const e = blank(dto.email);
      if (e && !EMAIL.test(e)) throw new BadRequestException("That email address does not look right.");
      out.email = e ? e.toLowerCase() : null;
    }
    if (has("tin")) out.tin = blank(dto.tin);
    if (has("addressLine1")) out.addressLine1 = blank(dto.addressLine1);
    if (has("addressLine2")) out.addressLine2 = blank(dto.addressLine2);
    if (has("city")) out.city = blank(dto.city);
    if (has("region")) out.region = blank(dto.region);
    if (has("paymentTermsDays") && dto.paymentTermsDays !== undefined) out.paymentTermsDays = dto.paymentTermsDays;
    if (has("creditLimit") && dto.creditLimit !== undefined) out.creditLimit = parseCreditLimit(dto.creditLimit);
    if (has("currency") && dto.currency) out.currency = dto.currency;
    if (has("notes")) out.notes = blank(dto.notes);
    if (has("externalRef")) out.externalRef = blank(dto.externalRef);
    return out as Partial<{
      contactPerson: string | null; phone: string | null; email: string | null; tin: string | null; addressLine1: string | null; addressLine2: string | null;
      city: string | null; region: string | null; paymentTermsDays: number; creditLimit: string | null; currency: string; notes: string | null; externalRef: string | null;
    }>;
  }

  // ─── codes and duplicates ───────────────────────────────────────────────────

  private async requireFreeCode(tx: FinDb, companyId: string, code: string) {
    const clash = await tx.finContact.findFirst({ where: { companyId, code }, select: { id: true } });
    if (clash) throw new ConflictException(`The code ${code} is already used by another contact.`);
    return code;
  }

  /** Next generated code (CUS-0001 / SUP-0001), skipping any that were typed in by hand. */
  private async nextFreeCode(tx: FinDb, companyId: string, isCustomer: boolean) {
    for (let i = 0; i < 50; i++) {
      const code = await this.numbering.next(companyId, isCustomer ? "CUSTOMER" : "SUPPLIER", tx);
      const clash = await tx.finContact.findFirst({ where: { companyId, code }, select: { id: true } });
      if (!clash) return code;
    }
    throw new ConflictException("Could not find a free contact code. Please enter one yourself.");
  }

  /** Looks for another contact with the same name, phone or TIN. */
  async findDuplicates(db: FinDb | PrismaService, companyId: string, probe: { name?: string; phone?: string | null; tin?: string | null }, excludeId?: string): Promise<Duplicate[]> {
    const or: Prisma.FinContactWhereInput[] = [];
    if (probe.phone) or.push({ phone: probe.phone });
    if (probe.tin) or.push({ tin: probe.tin });
    const key = probe.name ? nameKey(probe.name) : "";
    if (key) or.push({ name: { contains: probe.name!.trim().split(/\s+/)[0] } }); // narrow in SQL, compare exactly below
    if (or.length === 0) return [];
    const candidates = await db.finContact.findMany({ where: { companyId, ...(excludeId ? { id: { not: excludeId } } : {}), OR: or }, take: 200 });
    const out: Duplicate[] = [];
    for (const c of candidates) {
      const matchedOn: string[] = [];
      if (key && nameKey(c.name) === key) matchedOn.push("name");
      if (probe.phone && c.phone === probe.phone) matchedOn.push("phone");
      if (probe.tin && c.tin && c.tin.toLowerCase() === probe.tin.toLowerCase()) matchedOn.push("TIN");
      if (matchedOn.length) out.push({ id: c.id, code: c.code, name: c.name, matchedOn });
    }
    return out;
  }

  private async assertNoDuplicate(tx: FinDb, companyId: string, probe: { name?: string; phone?: string | null; tin?: string | null }, excludeId?: string) {
    const dups = await this.findDuplicates(tx, companyId, probe, excludeId);
    if (dups.length) {
      const d = dups[0];
      throw new ConflictException(`Possible duplicate: ${d.code} ${d.name} has the same ${d.matchedOn.join(" and ")}. Save again to create it anyway.`);
    }
  }

  // ─── CSV import / export ────────────────────────────────────────────────────

  template() {
    return toCsv(CONTACT_CSV_HEADERS, [
      ["", "Kofi Mensah Farms", "customer", "Kofi Mensah", "0244123456", "kofi@example.com", "C0012345678", "Plot 5, Market Road", "", "Kumasi", "Ashanti", 30, "5000.00", "Pays on the 1st", "CUST-0042"],
      ["", "Agro Supplies Ltd", "supplier", "Ama Boateng", "+233 20 555 1234", "", "", "Industrial Area", "", "Accra", "Greater Accra", 14, "", "", ""]
    ]);
  }

  async exportCsv(companyId: string) {
    const rows = await this.prisma.finContact.findMany({ where: { companyId }, orderBy: { name: "asc" }, take: 20000 });
    return toCsv(
      CONTACT_CSV_HEADERS,
      rows.map((c) => [
        c.code, c.name, c.isCustomer && c.isSupplier ? "both" : c.isSupplier ? "supplier" : "customer", c.contactPerson, c.phone, c.email, c.tin,
        c.addressLine1, c.addressLine2, c.city, c.region, c.paymentTermsDays, c.creditLimit?.toFixed(2) ?? "", c.notes, c.externalRef
      ])
    );
  }

  /** Reads and checks every row against the file and the database. Changes nothing. */
  async analyseImport(companyId: string, csv: string): Promise<{ plans: ImportPlan[]; missingColumns: string[] }> {
    const { headers, rows } = parseCsvObjects(csv, CSV_ALIASES);
    if (!headers.includes("name")) throw new BadRequestException('The CSV needs a "name" column.');
    const unknown = headers.filter((h) => h && !CONTACT_CSV_HEADERS.includes(h));
    const existing = await this.prisma.finContact.findMany({ where: { companyId } });
    const byCode = new Map(existing.map((c) => [c.code.toLowerCase(), c]));
    const byRef = new Map(existing.filter((c) => c.externalRef).map((c) => [c.externalRef!.toLowerCase(), c]));
    const byNamePhone = new Map(existing.map((c) => [`${nameKey(c.name)}|${c.phone ?? ""}`, c]));

    const seenCodes = new Map<string, number>();
    const seenRefs = new Map<string, number>();
    const seenKeys = new Map<string, number>();
    const claimed = new Map<string, number>(); // existing contact id -> first line that matched it

    const plans: ImportPlan[] = rows.map(({ line, values: v }) => {
      const errors: string[] = [];
      const data: ImportPlan["data"] = {};
      const name = (v.name ?? "").trim();
      if (name.length < 2) errors.push("The name is missing or too short.");
      else if (name.length > 160) errors.push("The name is longer than 160 characters.");
      else data.name = name;

      // type
      const t = (v.type ?? "").toLowerCase();
      const typeMap: Record<string, [boolean, boolean]> = { customer: [true, false], client: [true, false], supplier: [false, true], vendor: [false, true], both: [true, true] };
      let typeGiven = false;
      if (t) {
        if (!typeMap[t]) errors.push(`The type "${v.type}" is not valid. Use customer, supplier or both.`);
        else {
          [data.isCustomer, data.isSupplier] = typeMap[t];
          typeGiven = true;
        }
      }
      const attempt = (fn: () => void) => {
        try {
          fn();
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Invalid value.");
        }
      };
      if (v.phone) attempt(() => { data.phone = normalizePhone(v.phone)!; });
      if (v.email) attempt(() => { if (!EMAIL.test(v.email)) throw new Error(`The email "${v.email}" does not look right.`); data.email = v.email.toLowerCase(); });
      if (v.tin) { if (v.tin.length > 40) errors.push("The TIN is longer than 40 characters."); else data.tin = v.tin; }
      if (v.contact_person) { if (v.contact_person.length > 120) errors.push("The contact person is longer than 120 characters."); else data.contactPerson = v.contact_person; }
      for (const [col, key, max] of [["address_line1", "addressLine1", 160], ["address_line2", "addressLine2", 160], ["city", "city", 80], ["region", "region", 80], ["notes", "notes", 500], ["external_ref", "externalRef", 100]] as const) {
        if (v[col]) { if (v[col].length > max) errors.push(`${col} is longer than ${max} characters.`); else (data as Record<string, unknown>)[key] = v[col]; }
      }
      if (v.payment_terms_days) {
        const n = Number(v.payment_terms_days);
        if (!Number.isInteger(n) || n < 0 || n > 365) errors.push("Payment terms must be a whole number of days from 0 to 365.");
        else data.paymentTermsDays = n;
      }
      if (v.credit_limit) attempt(() => { const c = parseCreditLimit(v.credit_limit); if (c) data.creditLimit = c; });
      if (v.code) {
        if (!/^[A-Za-z0-9._-]{1,30}$/.test(v.code)) errors.push("The code can only contain letters, digits, dot, dash and underscore (max 30).");
        else data.code = v.code;
      }

      // in-file duplicates
      const dupNote = (map: Map<string, number>, key: string, label: string) => {
        const first = map.get(key);
        if (first !== undefined) errors.push(`The ${label} is already used on line ${first} of this file.`);
        else map.set(key, line);
      };
      if (data.code) dupNote(seenCodes, data.code.toLowerCase(), "code");
      if (data.externalRef) dupNote(seenRefs, data.externalRef.toLowerCase(), "external_ref");
      if (data.name) dupNote(seenKeys, `${nameKey(data.name)}|${data.phone ?? ""}`, "name and phone");

      // match an existing contact: code, then external reference, then name + phone
      let match: ContactRow | undefined;
      let matchedBy: ImportPlan["matchedBy"];
      if (data.code && byCode.has(data.code.toLowerCase())) { match = byCode.get(data.code.toLowerCase()); matchedBy = "code"; }
      else if (data.externalRef && byRef.has(data.externalRef.toLowerCase())) { match = byRef.get(data.externalRef.toLowerCase()); matchedBy = "external_ref"; }
      else if (data.name && byNamePhone.has(`${nameKey(data.name)}|${data.phone ?? ""}`)) { match = byNamePhone.get(`${nameKey(data.name)}|${data.phone ?? ""}`); matchedBy = "name+phone"; }
      if (match) {
        const first = claimed.get(match.id);
        if (first !== undefined) errors.push(`This row matches the same existing contact (${match.code}) as line ${first}.`);
        else claimed.set(match.id, line);
        if (data.code && matchedBy !== "code" && data.code.toLowerCase() !== match.code.toLowerCase()) errors.push(`The code ${data.code} belongs to a different contact than the one this row matches (${match.code}).`);
      } else if (!typeGiven) {
        data.isCustomer = true; // new contact with no type: a customer
        data.isSupplier = false;
      }

      return {
        line,
        action: errors.length ? "error" : match ? "update" : "create",
        errors,
        name: data.name ?? name,
        code: match?.code ?? data.code ?? null,
        matchedId: match?.id,
        matchedBy,
        data
      } satisfies ImportPlan;
    });
    return { plans, missingColumns: unknown };
  }

  async previewImport(companyId: string, csv: string) {
    const { plans, missingColumns } = await this.analyseImport(companyId, csv);
    return {
      totalRows: plans.length,
      toCreate: plans.filter((p) => p.action === "create").length,
      toUpdate: plans.filter((p) => p.action === "update").length,
      errorRows: plans.filter((p) => p.action === "error").length,
      ignoredColumns: missingColumns,
      rows: plans.map(({ line, action, errors, name, code, matchedBy }) => ({ line, action, errors, name, code, matchedBy })),
      canImport: plans.length > 0 && plans.every((p) => p.action !== "error")
    };
  }

  /** All or nothing: re-checks every row, then creates and updates in ONE transaction. Blank cells never wipe existing data. */
  async commitImport(companyId: string, userId: string, csv: string, fileName: string | undefined, meta: RequestMeta) {
    const { plans } = await this.analyseImport(companyId, csv);
    if (plans.length === 0) throw new BadRequestException("The CSV has no data rows.");
    const bad = plans.filter((p) => p.action === "error");
    if (bad.length) {
      throw new BadRequestException(`${bad.length} row${bad.length === 1 ? " has" : "s have"} errors, so nothing was imported. First problem: line ${bad[0].line}: ${bad[0].errors[0]}`);
    }
    return this.prisma.$transaction(
      async (tx) => {
        let created = 0;
        let updated = 0;
        for (const p of plans) {
          const d = p.data;
          if (p.action === "update" && p.matchedId) {
            await tx.finContact.update({
              where: { id: p.matchedId },
              data: {
                ...(d.name !== undefined ? { name: d.name } : {}),
                ...(d.isCustomer !== undefined ? { isCustomer: d.isCustomer, isSupplier: d.isSupplier } : {}),
                ...(d.contactPerson !== undefined ? { contactPerson: d.contactPerson } : {}),
                ...(d.phone !== undefined ? { phone: d.phone } : {}),
                ...(d.email !== undefined ? { email: d.email } : {}),
                ...(d.tin !== undefined ? { tin: d.tin } : {}),
                ...(d.addressLine1 !== undefined ? { addressLine1: d.addressLine1 } : {}),
                ...(d.addressLine2 !== undefined ? { addressLine2: d.addressLine2 } : {}),
                ...(d.city !== undefined ? { city: d.city } : {}),
                ...(d.region !== undefined ? { region: d.region } : {}),
                ...(d.paymentTermsDays !== undefined ? { paymentTermsDays: d.paymentTermsDays } : {}),
                ...(d.creditLimit !== undefined ? { creditLimit: d.creditLimit } : {}),
                ...(d.notes !== undefined ? { notes: d.notes } : {}),
                ...(d.externalRef !== undefined ? { externalRef: d.externalRef } : {}),
                updatedById: userId
              }
            });
            updated++;
          } else {
            const isCustomer = d.isCustomer ?? true;
            const code = d.code ? await this.requireFreeCode(tx, companyId, d.code) : await this.nextFreeCode(tx, companyId, isCustomer);
            await tx.finContact.create({
              data: {
                companyId, code, name: d.name!, isCustomer, isSupplier: d.isSupplier ?? false,
                contactPerson: d.contactPerson, phone: d.phone, email: d.email, tin: d.tin, addressLine1: d.addressLine1, addressLine2: d.addressLine2,
                city: d.city, region: d.region, paymentTermsDays: d.paymentTermsDays ?? 0, creditLimit: d.creditLimit, notes: d.notes, externalRef: d.externalRef,
                createdById: userId
              }
            });
            created++;
          }
        }
        const batch = await tx.finImportBatch.create({ data: { companyId, kind: "CONTACTS", fileName: fileName?.slice(0, 200), totalRows: plans.length, createdRows: created, updatedRows: updated, userId } });
        await this.audit.write(
          { companyId, userId, area: "contacts", action: "IMPORT", entityType: "FinImportBatch", entityId: batch.id, summary: `Imported contacts from ${fileName ?? "a CSV file"}: ${created} created, ${updated} updated`, after: { totalRows: plans.length, created, updated }, ...meta },
          tx
        );
        return { batchId: batch.id, totalRows: plans.length, created, updated };
      },
      { timeout: 60_000, maxWait: 10_000 }
    );
  }
}

function parseCreditLimit(v: string | number | null): string | null {
  if (v === null || v === "") return null;
  const p = toPesewas(v, "The credit limit");
  if (p < 0) throw new BadRequestException("The credit limit cannot be negative.");
  return pesewasToDecimal(p);
}

function kind(c: { isCustomer: boolean; isSupplier: boolean }) {
  return c.isCustomer && c.isSupplier ? "customer/supplier" : c.isSupplier ? "supplier" : "customer";
}

function present(c: ContactRow) {
  return { ...c, creditLimit: c.creditLimit === null ? null : c.creditLimit.toFixed(2) };
}

function auditShape(c: ContactRow): Prisma.InputJsonValue {
  return {
    code: c.code, name: c.name, isCustomer: c.isCustomer, isSupplier: c.isSupplier, isActive: c.isActive, phone: c.phone, email: c.email, tin: c.tin,
    paymentTermsDays: c.paymentTermsDays, creditLimit: c.creditLimit?.toFixed(2) ?? null, externalRef: c.externalRef
  };
}
