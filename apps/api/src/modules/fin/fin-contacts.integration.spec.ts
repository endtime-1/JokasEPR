/**
 * Contacts, CSV import and tax integration tests (real MySQL with the fin migrations applied):
 *   FIN_TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3399/fintest npx jest --runInBand src/modules/fin
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { FinAuditService } from "./fin-audit.service";
import { FinContactsService } from "./fin-contacts.service";
import { FinNumberingService } from "./fin-numbering.service";
import { FinTaxService } from "./fin-tax.service";

const URL = process.env.FIN_TEST_DATABASE_URL;
const maybe = URL ? describe : describe.skip;

maybe("finance v2 contacts, import and tax (real MySQL)", () => {
  let prisma: PrismaClient;
  let contacts: FinContactsService;
  let tax: FinTaxService;
  const user = "user-1";
  const meta = { ipAddress: "127.0.0.1", userAgent: "jest" };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    await prisma.$connect();
    const audit = new FinAuditService(prisma as never);
    const numbering = new FinNumberingService(prisma as never, audit);
    contacts = new FinContactsService(prisma as never, audit, numbering);
    tax = new FinTaxService(prisma as never, audit);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const co = () => randomUUID();

  describe("contacts", () => {
    it("creates customers and suppliers with generated codes, normalised phone and lower-cased email", async () => {
      const c = co();
      const a = await contacts.create(c, user, { name: "Kofi Mensah Farms", phone: "024 412 3456", email: "Kofi@Example.COM", paymentTermsDays: 30, creditLimit: "5000.5" }, meta);
      const b = await contacts.create(c, user, { name: "Agro Supplies Ltd", isSupplier: true, isCustomer: false }, meta);
      const d = await contacts.create(c, user, { name: "Both Ways Co", isCustomer: true, isSupplier: true }, meta);
      expect(a.code).toBe("CUS-0001");
      expect(a.phone).toBe("+233244123456");
      expect(a.email).toBe("kofi@example.com");
      expect(a.creditLimit).toBe("5000.50");
      expect(a.isCustomer && !a.isSupplier).toBe(true);
      expect(b.code).toBe("SUP-0001");
      expect(d.code).toBe("CUS-0002"); // a "both" contact is numbered as a customer
      const log = await prisma.finAuditLog.findMany({ where: { companyId: c, entityType: "FinContact", action: "CREATE" } });
      expect(log).toHaveLength(3);
    });

    it("skips generated codes that were typed in by hand", async () => {
      const c = co();
      await contacts.create(c, user, { name: "Manual", code: "CUS-0001" }, meta);
      const next = await contacts.create(c, user, { name: "Generated" }, meta);
      expect(next.code).toBe("CUS-0002");
      await expect(contacts.create(c, user, { name: "Clash", code: "cus-0001" }, meta)).rejects.toThrow(/already used/);
    });

    it("rejects bad input: no role, bad email, bad phone, negative or 3-decimal credit", async () => {
      const c = co();
      await expect(contacts.create(c, user, { name: "X Co", isCustomer: false, isSupplier: false }, meta)).rejects.toThrow(/customer, a supplier/);
      await expect(contacts.create(c, user, { name: "X Co", email: "not-an-email" }, meta)).rejects.toThrow(/email/);
      await expect(contacts.create(c, user, { name: "X Co", phone: "abc" }, meta)).rejects.toThrow(/phone/i);
      await expect(contacts.create(c, user, { name: "X Co", creditLimit: "-5" }, meta)).rejects.toThrow(/negative/);
      await expect(contacts.create(c, user, { name: "X Co", creditLimit: "1.234" }, meta)).rejects.toThrow(/2 decimal/);
      expect(await prisma.finContact.count({ where: { companyId: c } })).toBe(0);
    });

    it("warns about duplicates (name, phone, TIN) and only creates them when confirmed", async () => {
      const c = co();
      await contacts.create(c, user, { name: "Kofi Mensah Farms", phone: "0244123456", tin: "C0011" }, meta);
      await expect(contacts.create(c, user, { name: "  KOFI  mensah farms " }, meta)).rejects.toThrow(/Possible duplicate.*name/);
      await expect(contacts.create(c, user, { name: "Other Name", phone: "+233244123456" }, meta)).rejects.toThrow(/Possible duplicate.*phone/);
      await expect(contacts.create(c, user, { name: "Third", tin: "c0011" }, meta)).rejects.toThrow(/Possible duplicate.*TIN/);
      const forced = await contacts.create(c, user, { name: "Kofi Mensah Farms", confirmDuplicate: true }, meta);
      expect(forced.code).toBe("CUS-0002");
      await expect(contacts.create(c, user, { name: "Totally Different" }, meta)).resolves.toBeDefined();
    });

    it("updates fields, never the code, and deactivates instead of deleting", async () => {
      const c = co();
      const a = await contacts.create(c, user, { name: "Old Name", phone: "0244123456" }, meta);
      const u = await contacts.update(c, user, a.id, { name: "New Name", city: "Kumasi", isSupplier: true, paymentTermsDays: 14 }, meta);
      expect(u.name).toBe("New Name");
      expect(u.city).toBe("Kumasi");
      expect(u.isSupplier && u.isCustomer).toBe(true);
      expect(u.code).toBe(a.code);
      expect(u.phone).toBe("+233244123456"); // untouched when not sent
      const off = await contacts.update(c, user, a.id, { isActive: false }, meta);
      expect(off.isActive).toBe(false);
      await expect(contacts.update(c, user, a.id, { isCustomer: false, isSupplier: false }, meta)).rejects.toThrow(/customer, a supplier/);
      const before = await prisma.finAuditLog.findFirstOrThrow({ where: { companyId: c, action: "UPDATE" }, orderBy: { createdAt: "asc" } });
      expect((before.before as { name: string }).name).toBe("Old Name");
      expect((before.after as { name: string }).name).toBe("New Name");
    });

    it("lists with type, search and active filters and keeps companies apart", async () => {
      const c = co();
      await contacts.create(c, user, { name: "Alpha Customer" }, meta);
      await contacts.create(c, user, { name: "Beta Supplier", isSupplier: true, isCustomer: false, phone: "0201112233" }, meta);
      const off = await contacts.create(c, user, { name: "Gamma Both", isSupplier: true, isCustomer: true }, meta);
      await contacts.update(c, user, off.id, { isActive: false }, meta);
      expect((await contacts.list(c, {})).total).toBe(3);
      expect((await contacts.list(c, { type: "customer" })).rows.map((r) => r.name).sort()).toEqual(["Alpha Customer", "Gamma Both"]);
      expect((await contacts.list(c, { type: "supplier" })).total).toBe(2);
      expect((await contacts.list(c, { activeOnly: true })).total).toBe(2);
      expect((await contacts.list(c, { search: "0201112233" })).rows[0].name).toBe("Beta Supplier");
      expect((await contacts.list(co(), {})).total).toBe(0);
      await expect(contacts.get(co(), off.id)).rejects.toThrow(/not found/);
    });
  });

  describe("CSV import", () => {
    const header = "code,name,type,contact_person,phone,email,tin,address_line1,address_line2,city,region,payment_terms_days,credit_limit,notes,external_ref";

    it("previews without changing anything, then imports all rows in one go", async () => {
      const c = co();
      const csv = [header, ",Kofi Farms,customer,Kofi,0244123456,k@x.com,,,,Kumasi,,30,5000,,EXT-1", ",Agro Ltd,supplier,,+233 20 555 1234,,,,,Accra,,14,,,", ",Both Co,both,,,,,,,,,,,,"].join("\n");
      const p = await contacts.previewImport(c, csv);
      expect(p).toMatchObject({ totalRows: 3, toCreate: 3, toUpdate: 0, errorRows: 0, canImport: true });
      expect(await prisma.finContact.count({ where: { companyId: c } })).toBe(0);
      const r = await contacts.commitImport(c, user, csv, "contacts.csv", meta);
      expect(r).toMatchObject({ totalRows: 3, created: 3, updated: 0 });
      const all = await contacts.list(c, {});
      expect(all.total).toBe(3);
      const kofi = all.rows.find((x) => x.name === "Kofi Farms")!;
      expect(kofi).toMatchObject({ code: "CUS-0001", phone: "+233244123456", paymentTermsDays: 30, creditLimit: "5000.00", externalRef: "EXT-1" });
      expect(all.rows.find((x) => x.name === "Agro Ltd")).toMatchObject({ code: "SUP-0001", isSupplier: true, isCustomer: false });
      expect(all.rows.find((x) => x.name === "Both Co")).toMatchObject({ isSupplier: true, isCustomer: true });
      const batch = await prisma.finImportBatch.findFirstOrThrow({ where: { companyId: c } });
      expect(batch).toMatchObject({ kind: "CONTACTS", fileName: "contacts.csv", totalRows: 3, createdRows: 3, updatedRows: 0 });
      expect(await prisma.finAuditLog.count({ where: { companyId: c, action: "IMPORT" } })).toBe(1);
    });

    it("re-importing updates by code, external ref or name+phone, and blank cells never wipe data", async () => {
      const c = co();
      const a = await contacts.create(c, user, { name: "Kofi Farms", phone: "0244123456", email: "kofi@x.com", city: "Kumasi", externalRef: "EXT-1" }, meta);
      const byCode = `${header}\n${a.code},Kofi Farms Renamed,,,,,,,,Accra,,,,,`;
      const r1 = await contacts.commitImport(c, user, byCode, "a.csv", meta);
      expect(r1).toMatchObject({ created: 0, updated: 1 });
      let now = await contacts.get(c, a.id);
      expect(now).toMatchObject({ name: "Kofi Farms Renamed", city: "Accra", email: "kofi@x.com", phone: "+233244123456" });
      const byRef = `${header}\n,Whatever,,,,,,,,,,45,,,EXT-1`;
      await contacts.commitImport(c, user, byRef, "b.csv", meta);
      now = await contacts.get(c, a.id);
      expect(now.paymentTermsDays).toBe(45);
      expect(now.name).toBe("Whatever");
      const byNamePhone = `${header}\n,whatever,,,024 412 3456,,,,,,,,,notes here,`;
      const p = await contacts.previewImport(c, byNamePhone);
      expect(p.rows[0]).toMatchObject({ action: "update", matchedBy: "name+phone" });
      expect(await prisma.finContact.count({ where: { companyId: c } })).toBe(1);
    });

    it("lists every bad row and imports NOTHING if any row is bad", async () => {
      const c = co();
      const csv = [header, ",Good One,customer,,,,,,,,,,,,", ",,customer,,,,,,,,,,,,", ",Bad Email,customer,,,nope,,,,,,,,,", ",Bad Type,reseller,,,,,,,,,,,,", ",Bad Terms,customer,,,,,,,,,400,,,", ",Bad Credit,customer,,,,,,,,,,1.234,,", ",Bad Phone,customer,,abc,,,,,,,,,,"].join("\n");
      const p = await contacts.previewImport(c, csv);
      expect(p).toMatchObject({ totalRows: 7, toCreate: 1, errorRows: 6, canImport: false });
      expect(p.rows.filter((r) => r.action === "error").map((r) => r.line)).toEqual([3, 4, 5, 6, 7, 8]);
      await expect(contacts.commitImport(c, user, csv, "bad.csv", meta)).rejects.toThrow(/nothing was imported/);
      expect(await prisma.finContact.count({ where: { companyId: c } })).toBe(0);
      expect(await prisma.finImportBatch.count({ where: { companyId: c } })).toBe(0);
    });

    it("flags duplicates inside the file and rows that hit the same existing contact", async () => {
      const c = co();
      const existing = await contacts.create(c, user, { name: "Kofi Farms", phone: "0244123456" }, meta);
      const csv = [header, "NEW-1,One,,,,,,,,,,,,,", "NEW-1,Two,,,,,,,,,,,,,", ",Same,,,0201112233,,,,,,,,,,", ",same,,,0201112233,,,,,,,,,,", `${existing.code},Hit Once,,,,,,,,,,,,,`, ",kofi farms,,,0244123456,,,,,,,,,,", ",Ref One,,,,,,,,,,,,,R1", ",Ref Two,,,,,,,,,,,,,r1"].join("\n");
      const p = await contacts.previewImport(c, csv);
      const err = (line: number) => p.rows.find((r) => r.line === line)!.errors.join(" ");
      expect(err(3)).toMatch(/code is already used on line 2/);
      expect(err(5)).toMatch(/name and phone is already used on line 4/);
      expect(err(7)).toMatch(/same existing contact/);
      expect(err(9)).toMatch(/external_ref is already used on line 8/);
      expect(p.canImport).toBe(false);
    });

    it("accepts header aliases, a BOM, semicolons and ignores unknown columns", async () => {
      const c = co();
      const csv = "﻿Contact Name;Mobile;E-mail;Favourite Colour\nAlias Farms;0244123456;a@b.co;blue";
      const p = await contacts.previewImport(c, csv);
      expect(p).toMatchObject({ toCreate: 1, errorRows: 0, ignoredColumns: ["favourite_colour"] });
      await contacts.commitImport(c, user, csv, undefined, meta);
      expect((await contacts.list(c, {})).rows[0]).toMatchObject({ name: "Alias Farms", phone: "+233244123456", email: "a@b.co" });
    });

    it("rejects a file with no name column or no data rows", async () => {
      const c = co();
      await expect(contacts.previewImport(c, "phone\n0244123456")).rejects.toThrow(/"name" column/);
      await expect(contacts.commitImport(c, user, "name\n", undefined, meta)).rejects.toThrow(/no data rows/);
    });

    it("exports in the same shape it imports (round trip) and gives a usable template", async () => {
      const c = co();
      await contacts.create(c, user, { name: 'Quote "Co", Ltd', isSupplier: true, phone: "0244123456", creditLimit: "100" }, meta);
      const csv = await contacts.exportCsv(c);
      const again = co();
      const p = await contacts.previewImport(again, csv);
      expect(p).toMatchObject({ toCreate: 1, errorRows: 0 });
      await contacts.commitImport(again, user, csv, "export.csv", meta);
      expect((await contacts.list(again, {})).rows[0]).toMatchObject({ name: 'Quote "Co", Ltd', isSupplier: true, isCustomer: false });
      const t = await contacts.previewImport(co(), contacts.template());
      expect(t).toMatchObject({ toCreate: 2, errorRows: 0 });
    });

    it("is atomic: a row that fails part-way through undoes the whole import", async () => {
      const c = co();
      const csv = [header, ",Fresh One,,,,,,,,,,,,,", "RACE-1,Fresh Two,,,,,,,,,,,,,"].join("\n");
      // Between the check and the write, someone else takes the code the second row wants.
      const original = contacts.analyseImport.bind(contacts);
      const spy = jest.spyOn(contacts, "analyseImport").mockImplementation(async (...args) => {
        const result = await original(...args);
        await prisma.finContact.create({ data: { companyId: c, code: "RACE-1", name: "Sneaky" } });
        return result;
      });
      await expect(contacts.commitImport(c, user, csv, "race.csv", meta)).rejects.toThrow(/already used/);
      spy.mockRestore();
      expect((await contacts.list(c, {})).rows.map((r) => r.name)).toEqual(["Sneaky"]); // "Fresh One" was rolled back
      expect(await prisma.finImportBatch.count({ where: { companyId: c } })).toBe(0);
      expect(await prisma.finAuditLog.count({ where: { companyId: c, action: "IMPORT" } })).toBe(0);
    });

    it("skips generated codes that collide with ones already in use", async () => {
      const c = co();
      await prisma.finContact.create({ data: { companyId: c, code: "CUS-0001", name: "Squatter" } });
      const r = await contacts.commitImport(c, user, [header, ",Fresh One,,,,,,,,,,,,,", ",Fresh Two,,,,,,,,,,,,,"].join("\n"), "ok.csv", meta);
      expect(r.created).toBe(2);
      expect((await contacts.list(c, {})).rows.map((x) => x.code).sort()).toEqual(["CUS-0001", "CUS-0002", "CUS-0003"]);
    });
  });

  describe("tax codes and rates", () => {
    it("starts a company with only a 0% No tax code (nothing assumed)", async () => {
      const c = co();
      const list = await tax.list(c);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ code: "NONE", name: "No tax", currentRate: "0.0000", isActive: true });
      expect((await tax.list(c)).length).toBe(1); // idempotent
    });

    it("creates a code with a first rate, and rates only ever move forward in time", async () => {
      const c = co();
      await tax.ensureDefaults(c);
      await tax.create(c, user, { code: "VAT", name: "VAT", appliesTo: "BOTH", isRecoverable: true, ratePercent: "15", effectiveFrom: "2026-04-01" }, meta);
      const vat = (await tax.list(c)).find((t) => t.code === "VAT")!;
      expect(vat).toMatchObject({ currentRate: "15.0000", isRecoverable: true, appliesTo: "BOTH" });
      await expect(tax.create(c, user, { code: "VAT", name: "Dup", ratePercent: "1" }, meta)).rejects.toThrow(/already exists/);
      await expect(tax.create(c, user, { code: "NEW", name: "No rate" }, meta)).rejects.toThrow(/Enter the tax rate/);
      await expect(tax.create(c, user, { code: "BIG", name: "Too big", ratePercent: "101" }, meta)).rejects.toThrow(/more than 100/);
      await expect(tax.addRate(c, user, vat.id, { ratePercent: "12.5", effectiveFrom: "2026-04-01" }, meta)).rejects.toThrow(/must start after/);
      await expect(tax.addRate(c, user, vat.id, { ratePercent: "12.5", effectiveFrom: "2026-01-01" }, meta)).rejects.toThrow(/must start after/);
      await tax.addRate(c, user, vat.id, { ratePercent: "12.5", effectiveFrom: "2027-01-01", note: "Budget 2027" }, meta);
      const after = (await tax.list(c)).find((t) => t.code === "VAT")!;
      expect(after.rates.map((r) => [r.ratePercent, r.effectiveFrom])).toEqual([["12.5000", "2027-01-01"], ["15.0000", "2026-04-01"]]);
    });

    it("resolves the rate in force on a document's date, and refuses guesswork", async () => {
      const c = co();
      await tax.ensureDefaults(c);
      await tax.create(c, user, { code: "VAT", name: "VAT", ratePercent: "15", effectiveFrom: "2026-04-01" }, meta);
      const vat = (await tax.list(c)).find((t) => t.code === "VAT")!;
      await tax.addRate(c, user, vat.id, { ratePercent: "12.5", effectiveFrom: "2027-01-01" }, meta);
      expect((await tax.resolve(c, vat.id, new Date("2026-06-30"))).ratePercent).toBe("15.0000");
      expect((await tax.resolve(c, vat.id, new Date("2027-01-01"))).ratePercent).toBe("12.5000");
      await expect(tax.resolve(c, vat.id, new Date("2026-03-31"))).rejects.toThrow(/no rate for 2026-03-31/);
      await expect(tax.resolve(c, randomUUID(), new Date())).rejects.toThrow(/does not exist/);
      await tax.update(c, user, vat.id, { isActive: false }, meta);
      await expect(tax.resolve(c, vat.id, new Date("2026-06-30"))).rejects.toThrow(/switched off/);
      await expect(tax.resolve(co(), vat.id, new Date())).rejects.toThrow(/does not exist/); // other company
    });

    it("makes rate history append-only in the database", async () => {
      const c = co();
      await tax.ensureDefaults(c);
      const none = (await tax.list(c))[0];
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_tax_rates SET ratePercent = 99 WHERE taxCodeId = '${none.id}'`)).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_tax_rates WHERE taxCodeId = '${none.id}'`)).rejects.toThrow(/append-only/);
      await contacts.create(c, user, { name: "Import log owner" }, meta);
      await contacts.commitImport(c, user, "name\nLog Test", "log.csv", meta);
      const batch = await prisma.finImportBatch.findFirstOrThrow({ where: { companyId: c } });
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_import_batches SET totalRows = 99 WHERE id = '${batch.id}'`)).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_import_batches WHERE id = '${batch.id}'`)).rejects.toThrow(/append-only/);
    });

    it("lets a code be renamed or switched off but never changes its rates, and audits it", async () => {
      const c = co();
      await tax.ensureDefaults(c);
      await tax.create(c, user, { code: "LEVY", name: "Levy", ratePercent: "2.5" }, meta);
      const levy = (await tax.list(c)).find((t) => t.code === "LEVY")!;
      await tax.update(c, user, levy.id, { name: "Health levy", isActive: false }, meta);
      const now = (await tax.list(c)).find((t) => t.code === "LEVY")!;
      expect(now).toMatchObject({ name: "Health levy", isActive: false, currentRate: "2.5000" });
      const actions = (await prisma.finAuditLog.findMany({ where: { companyId: c, entityType: "FinTaxCode" } })).map((l) => l.action).sort();
      expect(actions).toEqual(["CREATE_TAX_CODE", "UPDATE_TAX_CODE"]);
    });
  });
});
