import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { EmployeeCardService, SCAN_PERMISSION, VERSIONS_KEY, decideScan, parseEmployeeCode, signEmployeeCode, verifyEmployeeCode } from "./employee-card.service";

const SECRET = "x".repeat(40);
const COMPANY = "11111111-1111-4111-8111-111111111111";
const EMP = "22222222-2222-4222-8222-222222222222";

const user = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: "u1", companyId: COMPANY, email: "hr@example.com", fullName: "HR", roles: [], permissions: [],
  branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [], hasGlobalAccess: true, ...over
});

describe("card code", () => {
  it("is signed, and only a genuine one verifies", () => {
    const code = signEmployeeCode(SECRET, COMPANY, EMP);
    expect(code).toMatch(/^JK1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{22}$/);
    expect(verifyEmployeeCode(SECRET, COMPANY, code)).toBe(EMP);
    expect(verifyEmployeeCode(SECRET, COMPANY, ` ${code}\n`)).toBe(EMP);
  });
  it("refuses edits, other companies, other secrets and junk", () => {
    const code = signEmployeeCode(SECRET, COMPANY, EMP);
    const other = "33333333-3333-4333-8333-333333333333";
    expect(verifyEmployeeCode(SECRET, COMPANY, code.replace(EMP, other))).toBeNull();
    expect(verifyEmployeeCode(SECRET, COMPANY, code.slice(0, -1) + (code.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(verifyEmployeeCode(SECRET, other, code)).toBeNull();
    expect(verifyEmployeeCode("y".repeat(40), COMPANY, code)).toBeNull();
    const v2 = signEmployeeCode(SECRET, COMPANY, EMP, 2);
    expect(v2).toMatch(/^JK1\.[0-9a-f-]{36}\.2\.[A-Za-z0-9_-]{22}$/);
    expect(parseEmployeeCode(SECRET, COMPANY, v2)).toEqual({ employeeId: EMP, version: 2 });
    expect(parseEmployeeCode(SECRET, COMPANY, code)).toEqual({ employeeId: EMP, version: 0 });
    expect(parseEmployeeCode(SECRET, COMPANY, v2.replace(".2.", ".3."))).toBeNull();
    expect(parseEmployeeCode(SECRET, COMPANY, v2.replace(".2.", ".0."))).toBeNull();
    for (const junk of ["", "hello", "JK1.abc.def", "JK2." + EMP + ".x", "JK1." + EMP, `JK1.${EMP}.${"a".repeat(22)}.extra`, undefined as unknown as string]) {
      expect(verifyEmployeeCode(SECRET, COMPANY, junk)).toBeNull();
    }
  });
});

// 2026-11-09 is a Monday, 2026-11-14 a Saturday, 2026-11-15 a Sunday.
const day = (d: number, h = 8) => new Date(2026, 10, d, h, 0);

describe("decideScan", () => {
  it("the first scan marks the day, with or without a record for the day", () => {
    expect(decideScan(day(9), null)).toEqual({ action: "MARKED" });
    expect(decideScan(day(14), { id: "a", status: "ABSENT", checkInTime: null })).toEqual({ action: "MARKED" });
    expect(decideScan(day(9), { id: "a", status: "ON_LEAVE", checkInTime: null })).toEqual({ action: "MARKED" });
  });
  it("any later scan the same day only says it is already marked", () => {
    expect(decideScan(day(9, 17), { id: "a", status: "PRESENT", checkInTime: day(9) })).toEqual({ action: "ALREADY_MARKED" });
    expect(decideScan(day(9), { id: "a", status: "PRESENT", checkInTime: null })).toEqual({ action: "ALREADY_MARKED" });
    expect(decideScan(day(9), { id: "a", status: "LATE", checkInTime: null })).toEqual({ action: "ALREADY_MARKED" });
  });
  it("a Sunday scan counts like any other day (some Sundays are worked)", () => {
    expect(decideScan(day(15), null)).toEqual({ action: "MARKED" });
    expect(decideScan(day(15), { id: "a", status: "PRESENT", checkInTime: day(15) })).toEqual({ action: "ALREADY_MARKED" });
  });
});

describe("EmployeeCardService", () => {
  const prisma = {
    employee: { findFirst: jest.fn() },
    company: { findUnique: jest.fn() },
    systemSetting: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    attendanceRecord: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }
  };
  const audit = { write: jest.fn().mockResolvedValue(undefined) };
  const config = { getOrThrow: jest.fn().mockReturnValue(SECRET) };
  const service = new EmployeeCardService(prisma as never, audit as never, config as never);
  let settings: Record<string, { id: string; value: unknown }> = {};
  const code = signEmployeeCode(SECRET, COMPANY, EMP);
  const employee = { id: EMP, code: "E-001", fullName: "Ama Mensah", status: "ACTIVE", photoUrl: "p.jpg", employeeRole: { name: "Supervisor" }, branch: { name: "Farm 1" } };
  const monday = new Date(2026, 10, 9, 7, 45);
  const sunday = new Date(2026, 10, 15, 7, 45);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: monday });
    settings = {};
    prisma.company.findUnique.mockResolvedValue({ name: "Akoko Solutions", legalName: null });
    prisma.systemSetting.findFirst.mockImplementation(async ({ where }: { where: { key: string } }) => settings[where.key] ?? null);
    prisma.systemSetting.update.mockResolvedValue({ id: "s1" });
    prisma.systemSetting.create.mockResolvedValue({ id: "s1" });
    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.attendanceRecord.findUnique.mockResolvedValue(null);
    prisma.attendanceRecord.create.mockResolvedValue({ id: "att-1" });
    prisma.attendanceRecord.update.mockResolvedValue({ id: "att-1" });
  });
  afterEach(() => jest.useRealTimers());

  it("the first scan of the day creates a PRESENT record with the time, and is audited", async () => {
    const res = await service.scan(user(), code);
    expect(res.data.action).toBe("MARKED");
    expect(res.data.employee).toMatchObject({ fullName: "Ama Mensah", code: "E-001", roleName: "Supervisor" });
    expect(prisma.attendanceRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ companyId: COMPANY, employeeId: EMP, status: "PRESENT", recordedById: "u1", checkInTime: expect.any(Date) }) }));
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityId: "att-1" }));
  });

  it("works when attendance for the day was never opened (no record at all)", async () => {
    prisma.attendanceRecord.findUnique.mockResolvedValue(null);
    expect((await service.scan(user(), code)).data.action).toBe("MARKED");
    expect(prisma.attendanceRecord.create).toHaveBeenCalledTimes(1);
  });

  it("a second scan the same day changes nothing and says it is already marked", async () => {
    prisma.attendanceRecord.findUnique.mockResolvedValue({ id: "att-1", status: "PRESENT", checkInTime: new Date(2026, 10, 9, 7, 30) });
    const res = await service.scan(user(), code);
    expect(res.data.action).toBe("ALREADY_MARKED");
    expect(res.data.markedAt).toEqual(new Date(2026, 10, 9, 7, 30));
    expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
    expect(prisma.attendanceRecord.update).not.toHaveBeenCalled();
    expect(audit.write).not.toHaveBeenCalled();
  });

  it("a day entered as absent is turned into present by the scan, not duplicated", async () => {
    prisma.attendanceRecord.findUnique.mockResolvedValue({ id: "att-9", status: "ABSENT", checkInTime: null });
    expect((await service.scan(user(), code)).data.action).toBe("MARKED");
    expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
    expect(prisma.attendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "att-9" }, data: expect.objectContaining({ status: "PRESENT" }) }));
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE" }));
  });

  it("Sunday: marked like any other day", async () => {
    jest.setSystemTime(sunday);
    expect((await service.scan(user(), code)).data.action).toBe("MARKED");
    expect(prisma.attendanceRecord.create).toHaveBeenCalledTimes(1);
  });

  it("Saturday is a working day", async () => {
    jest.setSystemTime(new Date(2026, 10, 14, 8, 0));
    expect((await service.scan(user(), code)).data.action).toBe("MARKED");
  });

  it("looks the employee up inside the caller's company only", async () => {
    await service.scan(user(), code);
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: EMP, companyId: COMPANY, deletedAt: null }) }));
  });

  it("refuses a forged code, a stranger's card, and an inactive employee", async () => {
    await expect(service.scan(user(), "JK1." + EMP + "." + "A".repeat(22))).rejects.toBeInstanceOf(BadRequestException);
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(service.scan(user(), code)).rejects.toBeInstanceOf(NotFoundException);
    prisma.employee.findFirst.mockResolvedValue({ ...employee, status: "TERMINATED" });
    await expect(service.scan(user(), code)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
  });

  it("who may scan: the scanner permission, or HR manage, or full access, and nobody else", async () => {
    const plain = user({ hasGlobalAccess: false, permissions: ["hr.read", "poultry.read"] });
    await expect(service.scan(plain, code)).rejects.toThrow(/permission to scan/);
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    expect((await service.scan(user({ hasGlobalAccess: false, permissions: [SCAN_PERMISSION] }), code)).data.action).toBe("MARKED");
    prisma.attendanceRecord.findUnique.mockResolvedValue({ id: "att-1", status: "PRESENT", checkInTime: new Date() });
    expect((await service.scan(user({ hasGlobalAccess: false, permissions: ["hr.manage"] }), code)).data.action).toBe("ALREADY_MARKED");
  });

  it("a replaced card: the old code stops working, the new one works", async () => {
    settings[VERSIONS_KEY] = { id: "s1", value: { [EMP]: 2 } };
    await expect(service.scan(user(), code)).rejects.toThrow(/replaced by a newer one/);
    const fresh = signEmployeeCode(SECRET, COMPANY, EMP, 2);
    expect((await service.scan(user(), fresh)).data.action).toBe("MARKED");
    await expect(service.scan(user(), signEmployeeCode(SECRET, COMPANY, EMP, 1))).rejects.toThrow(/replaced/);
    expect(prisma.attendanceRecord.create).toHaveBeenCalledTimes(1);
  });

  it("replacing a card creates the setting the first time, then raises the number", async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: EMP, code: "E-001", fullName: "Ama Mensah", firstName: "Ama", lastName: "M", employeeRole: null, branch: null, farm: null, company: null });
    const first = await service.reissue(user(), EMP);
    expect(prisma.systemSetting.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ key: VERSIONS_KEY, value: { [EMP]: 1 } }) }));
    expect(first.data.id).toBe(EMP);
    settings[VERSIONS_KEY] = { id: "s1", value: { [EMP]: 1, other: 4 } };
    await service.reissue(user(), EMP);
    expect(prisma.systemSetting.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ value: { [EMP]: 2, other: 4 } }) }));
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ summary: expect.stringContaining("old card no longer works (version 2)") }));
  });

  it("the card shows the company address and logo from Settings", async () => {
    settings["company.address"] = { id: "a", value: { address: "12 Cocoa Road, Kumasi" } };
    settings["company.logo"] = { id: "l", value: { logoUrl: "/uploads/logo.png" } };
    prisma.employee.findFirst.mockResolvedValue({ id: EMP, code: "E-1", firstName: "A", lastName: "B", fullName: "A B", status: "ACTIVE", startDate: new Date(), employeeRole: null, branch: null, farm: null, company: { name: "Akoko Solutions", legalName: null } });
    const { data } = await service.getCard(user(), EMP);
    expect(data).toMatchObject({ companyAddress: "12 Cocoa Road, Kumasi", companyLogoUrl: "/uploads/logo.png" });
  });

  it("a branch-limited user is scoped like the rest of HR", async () => {
    await service.scan(user({ hasGlobalAccess: false, branchIds: ["b1"], permissions: [SCAN_PERMISSION] }), code);
    const where = prisma.employee.findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"branchId":{"in":["b1"]}');
  });

  it("the card carries only what belongs on an ID card, and a QR that verifies", async () => {
    prisma.employee.findFirst.mockResolvedValue({
      id: EMP, code: "E-001", firstName: "Ama", lastName: "Mensah", fullName: "Ama Mensah", gender: "FEMALE", phone: "024", startDate: new Date("2025-01-02"), endDate: null,
      status: "ACTIVE", photoUrl: "p.jpg", emergencyContactName: "Kofi", emergencyContactPhone: "020",
      employeeRole: { name: "Supervisor" }, branch: { name: "Farm 1", city: "Kumasi" }, farm: null, company: { name: "Akoko Solutions", legalName: null }
    });
    const { data } = await service.getCard(user(), EMP);
    expect(verifyEmployeeCode(SECRET, COMPANY, data.qrCode)).toBe(EMP);
    expect(data.qrSvg).toContain("<svg");
    expect(data).toMatchObject({ fullName: "Ama Mensah", roleName: "Supervisor", locationName: "Farm 1", companyName: "Akoko Solutions" });
    const select = prisma.employee.findFirst.mock.calls[0][0].select;
    for (const secret of ["basicSalary", "bankAccount", "nationalId", "ssnitNumber", "tinNumber", "dateOfBirth", "address"]) expect(select).not.toHaveProperty(secret);
  });
});
