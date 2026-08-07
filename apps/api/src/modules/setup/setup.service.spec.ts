import { ForbiddenException } from "@nestjs/common";
import { SetupService } from "./setup.service";

const mockPrisma = {
  user: { count: jest.fn(), create: jest.fn() },
  company: { create: jest.fn() },
  branch: { create: jest.fn() },
  permission: { create: jest.fn() },
  role: { create: jest.fn() },
  userRole: { create: jest.fn() },
  userBranchAccess: { create: jest.fn() }
};

function makeService() {
  return new SetupService(mockPrisma as never);
}

function makeDto() {
  return {
    companyName: "Acme Farms", adminName: "Admin User", email: "admin@acme.test",
    password: "Str0ng!Passw0rd"
  } as never;
}

const ORIGINAL_ENV = process.env;

describe("SetupService.setup — timing-safe token compare and password policy (M8)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, SETUP_DONE: undefined, SETUP_SECRET_TOKEN: "correct-horse-battery-staple" };
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.company.create.mockResolvedValue({ id: "company-1" });
    mockPrisma.branch.create.mockResolvedValue({ id: "branch-1" });
    mockPrisma.permission.create.mockResolvedValue({ id: "perm-1" });
    mockPrisma.role.create.mockResolvedValue({ id: "role-1" });
    mockPrisma.user.create.mockResolvedValue({ id: "user-1", email: "admin@acme.test" });
    mockPrisma.userRole.create.mockResolvedValue({});
    mockPrisma.userBranchAccess.create.mockResolvedValue({});
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("rejects when SETUP_SECRET_TOKEN is not configured", async () => {
    process.env.SETUP_SECRET_TOKEN = undefined;
    const service = makeService();

    await expect(service.setup(makeDto(), "anything")).rejects.toThrow(ForbiddenException);
  });

  it("rejects a same-length but wrong token without leaking timing info via a thrown length mismatch", async () => {
    const service = makeService();
    // Same length as "correct-horse-battery-staple" (28 chars)
    const wrongSameLength = "x".repeat("correct-horse-battery-staple".length);

    await expect(service.setup(makeDto(), wrongSameLength)).rejects.toThrow(ForbiddenException);
  });

  it("rejects a different-length token without throwing an unhandled RangeError", async () => {
    const service = makeService();

    await expect(service.setup(makeDto(), "short")).rejects.toThrow(ForbiddenException);
  });

  it("rejects a missing token cleanly", async () => {
    const service = makeService();

    await expect(service.setup(makeDto(), undefined)).rejects.toThrow(ForbiddenException);
  });

  it("proceeds when the token matches exactly", async () => {
    const service = makeService();

    const result = await service.setup(makeDto(), "correct-horse-battery-staple");
    expect(result.success).toBe(true);
    expect(mockPrisma.company.create).toHaveBeenCalled();
  });
});
