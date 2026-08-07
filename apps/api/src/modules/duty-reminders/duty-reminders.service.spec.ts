import { DutyRemindersService } from "./duty-reminders.service";

const mockPrisma = {
  loginRateLimit: { create: jest.fn(), updateMany: jest.fn() },
  stockReservation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }
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
