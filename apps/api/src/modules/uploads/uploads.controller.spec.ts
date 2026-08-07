import { NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { UploadsController } from "./uploads.controller";

jest.mock("fs", () => ({ existsSync: jest.fn().mockReturnValue(true) }));

const mockPrisma = {
  employee: { findFirst: jest.fn() },
  employeeDocument: { findFirst: jest.fn() }
};

function makeRes() {
  return { sendFile: jest.fn((_path: string, cb: (err?: Error) => void) => cb()), status: jest.fn().mockReturnThis(), end: jest.fn() } as never;
}

function makeUser(companyId = "company-1"): AuthenticatedUser {
  return {
    id: "user-1", companyId, email: "u@x.com", fullName: "U",
    roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [],
    hasGlobalAccess: false
  };
}

describe("UploadsController — cross-tenant file access (C3)", () => {
  let controller: UploadsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UploadsController(mockPrisma as never);
  });

  describe("serveEmployeeFile", () => {
    it("rejects a photo that doesn't belong to any employee in the requester's company", async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        controller.serveEmployeeFile(makeUser("company-1"), "emp-123-abc.jpg", makeRes())
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.employee.findFirst).toHaveBeenCalledWith({
        where: { companyId: "company-1", photoUrl: "/api/v1/uploads/employees/emp-123-abc.jpg" },
        select: { id: true }
      });
    });

    it("serves the file when it belongs to an employee in the requester's company", async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({ id: "emp-1" });
      const res = makeRes();

      await controller.serveEmployeeFile(makeUser("company-1"), "emp-123-abc.jpg", res);

      expect((res as unknown as { sendFile: jest.Mock }).sendFile).toHaveBeenCalled();
    });

    it("rejects a malformed filename before ever querying the database", async () => {
      await expect(
        controller.serveEmployeeFile(makeUser("company-1"), "../../etc/passwd", makeRes())
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.employee.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("serveDocumentFile", () => {
    it("rejects a document that doesn't belong to any employee document in the requester's company", async () => {
      mockPrisma.employeeDocument.findFirst.mockResolvedValue(null);

      await expect(
        controller.serveDocumentFile(makeUser("company-1"), "123-456.pdf", makeRes())
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.employeeDocument.findFirst).toHaveBeenCalledWith({
        where: { companyId: "company-1", fileUrl: "/api/v1/uploads/documents/123-456.pdf" },
        select: { id: true }
      });
    });

    it("serves the file when it belongs to a document in the requester's company", async () => {
      mockPrisma.employeeDocument.findFirst.mockResolvedValue({ id: "doc-1" });
      const res = makeRes();

      await controller.serveDocumentFile(makeUser("company-1"), "123-456.pdf", res);

      expect((res as unknown as { sendFile: jest.Mock }).sendFile).toHaveBeenCalled();
    });
  });
});
