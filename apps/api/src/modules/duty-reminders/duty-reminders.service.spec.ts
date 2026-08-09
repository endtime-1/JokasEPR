import { DutyRemindersService } from "./duty-reminders.service";

const mockPrisma = {
  loginRateLimit: { create: jest.fn(), updateMany: jest.fn() },
  stockReservation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  company: { findMany: jest.fn().mockResolvedValue([]) },
  farm: { findMany: jest.fn().mockResolvedValue([]) },
  trainingRecord: { findMany: jest.fn().mockResolvedValue([]) },
  vaccinationRecord: { findMany: jest.fn().mockResolvedValue([]) },
  medicationRecord: { findMany: jest.fn().mockResolvedValue([]) }
};
const mockNotifications = { broadcast: jest.fn().mockResolvedValue(undefined) };

function makeService() {
  return new DutyRemindersService(mockPrisma as never, mockNotifications as never);
}

describe("DutyRemindersService — distributed lock so a single job can't double-run (L2)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("runs the job when it acquires the lock (no existing lock row)", async () => {
    mockPrisma.loginRateLimit.create.mockResolvedValue({});
    const service = makeService();

    await service.expireStockReservations();

    expect(mockPrisma.loginRateLimit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: "cron-lock:expireStockReservations" }) })
    );
    expect(mockPrisma.stockReservation.updateMany).toHaveBeenCalled();
  });

  it("skips the job entirely when another instance already holds an active lock", async () => {
    mockPrisma.loginRateLimit.create.mockRejectedValue(new Error("Unique constraint failed on the fields: (`key`)"));
    mockPrisma.loginRateLimit.updateMany.mockResolvedValue({ count: 0 }); // lock still active, nothing reclaimed

    const service = makeService();
    await service.expireStockReservations();

    expect(mockPrisma.stockReservation.updateMany).not.toHaveBeenCalled();
  });

  it("reclaims and runs the job when the existing lock has expired (a crashed prior run)", async () => {
    mockPrisma.loginRateLimit.create.mockRejectedValue(new Error("Unique constraint failed on the fields: (`key`)"));
    mockPrisma.loginRateLimit.updateMany.mockResolvedValue({ count: 1 }); // stale lock reclaimed

    const service = makeService();
    await service.expireStockReservations();

    expect(mockPrisma.stockReservation.updateMany).toHaveBeenCalled();
  });
});

describe("DutyRemindersService.morningReminder / eveningReminder — companyId scopes a manual trigger to one tenant (H16)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.loginRateLimit.create.mockResolvedValue({});
    mockPrisma.company.findMany.mockResolvedValue([]);
  });

  it("queries every company when called with no companyId (the scheduled cron's own behavior)", async () => {
    const service = makeService();
    await service.morningReminder();

    const where = mockPrisma.company.findMany.mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
  });

  it("restricts to a single company when called with a companyId (the manual /duty-reminders/trigger path)", async () => {
    const service = makeService();
    await service.morningReminder("company-1");

    const where = mockPrisma.company.findMany.mock.calls[0][0].where;
    expect(where.id).toBe("company-1");
  });

  it("uses a distinct lock key for a scoped trigger so it can't contend with the global scheduled run", async () => {
    const service = makeService();
    await service.morningReminder("company-1");

    expect(mockPrisma.loginRateLimit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: "cron-lock:morningReminder:company-1" }) })
    );
  });

  it("eveningReminder also restricts to a single company when given a companyId", async () => {
    const service = makeService();
    await service.eveningReminder("company-1");

    const where = mockPrisma.company.findMany.mock.calls[0][0].where;
    expect(where.id).toBe("company-1");
    expect(mockPrisma.loginRateLimit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: "cron-lock:eveningReminder:company-1" }) })
    );
  });
});

describe("DutyRemindersService — one company's notification failure doesn't cancel every other company's alert (H26)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.loginRateLimit.create.mockResolvedValue({});
  });

  it("certificateExpiryAlert still notifies company-2 after company-1's broadcast throws", async () => {
    mockPrisma.trainingRecord.findMany.mockResolvedValue([
      { title: "First Aid", employee: { companyId: "company-1", fullName: "A" } },
      { title: "Food Safety", employee: { companyId: "company-2", fullName: "B" } }
    ]);
    mockNotifications.broadcast
      .mockRejectedValueOnce(new Error("notification service down"))
      .mockResolvedValueOnce(undefined);

    const service = makeService();
    await expect(service.certificateExpiryAlert()).resolves.toBeUndefined();

    expect(mockNotifications.broadcast).toHaveBeenCalledTimes(2);
    expect(mockNotifications.broadcast).toHaveBeenNthCalledWith(2, "company-2", "HR_MANAGE", expect.objectContaining({ type: "DOCUMENT_EXPIRY_ALERT" }));
  });

  it("vaccinationDueDateReminder still notifies company-2 after company-1's broadcast throws", async () => {
    mockPrisma.vaccinationRecord.findMany.mockResolvedValue([
      { vaccineName: "Newcastle", nextDueDate: new Date(), flockBatch: { companyId: "company-1", code: "FB-1", name: "Batch 1" } },
      { vaccineName: "Gumboro", nextDueDate: new Date(), flockBatch: { companyId: "company-2", code: "FB-2", name: "Batch 2" } }
    ]);
    mockNotifications.broadcast
      .mockRejectedValueOnce(new Error("notification service down"))
      .mockResolvedValueOnce(undefined);

    const service = makeService();
    await expect(service.vaccinationDueDateReminder()).resolves.toBeUndefined();

    expect(mockNotifications.broadcast).toHaveBeenCalledTimes(2);
    expect(mockNotifications.broadcast).toHaveBeenNthCalledWith(2, "company-2", "POULTRY_MANAGE", expect.objectContaining({ entityType: "VaccinationRecord" }));
  });

  it("withdrawalPeriodAlert still notifies company-2 after company-1's broadcast throws", async () => {
    mockPrisma.medicationRecord.findMany.mockResolvedValue([
      { medicationName: "Amoxicillin", withdrawalUntil: new Date(), flockBatch: { companyId: "company-1", code: "FB-1", name: "Batch 1" } },
      { medicationName: "Tylosin", withdrawalUntil: new Date(), flockBatch: { companyId: "company-2", code: "FB-2", name: "Batch 2" } }
    ]);
    mockNotifications.broadcast
      .mockRejectedValueOnce(new Error("notification service down"))
      .mockResolvedValueOnce(undefined);

    const service = makeService();
    await expect(service.withdrawalPeriodAlert()).resolves.toBeUndefined();

    expect(mockNotifications.broadcast).toHaveBeenCalledTimes(2);
    expect(mockNotifications.broadcast).toHaveBeenNthCalledWith(2, "company-2", "POULTRY_MANAGE", expect.objectContaining({ entityType: "MedicationRecord" }));
  });
});
