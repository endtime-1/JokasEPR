import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PERMISSIONS } from "@jokas/shared";
import { FieldVisitsService, haversineM, verify } from "./field-visits.service";

const mockPrisma = {
  user: { findFirst: jest.fn(), findMany: jest.fn() },
  fieldVisit: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
};
const mockAudit = { write: jest.fn() };
const svc = () => new FieldVisitsService(mockPrisma as never, mockAudit as never);
const rep = { id: "rep-1", companyId: "c1", permissions: [], hasGlobalAccess: false } as never;
const manager = { id: "mgr-1", companyId: "c1", permissions: [PERMISSIONS.SALES_MANAGE], hasGlobalAccess: false } as never;

describe("field visit verification maths", () => {
  it("measures distance between two points in metres", () => {
    // ~111 km per degree of latitude
    expect(haversineM(6.0, -1.6, 6.001, -1.6)).toBeGreaterThan(105);
    expect(haversineM(6.0, -1.6, 6.001, -1.6)).toBeLessThan(115);
    expect(haversineM(6.0, -1.6, 6.0, -1.6)).toBe(0);
  });

  it("verifies a check-in near the pin, flags one far away, and says so when there is no pin", () => {
    expect(verify(120, 15)).toBe("VERIFIED");
    expect(verify(5000, 20)).toBe("FAR");
    expect(verify(null, 20)).toBe("UNPINNED");
  });

  it("calls a rough laptop position 'low accuracy' instead of 'far' when the error covers the distance", () => {
    expect(verify(1500, 3000)).toBe("LOW_ACCURACY");
    expect(verify(9000, 3000)).toBe("FAR");
  });
});

describe("FieldVisitsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue({ id: "x" });
  });

  it("a rep cannot plan a visit for someone else", async () => {
    await expect(svc().create(rep, { repId: "other", placeName: "Shop", plannedFor: "2026-10-26" } as never, {})).rejects.toThrow(ForbiddenException);
  });

  it("a manager can plan a visit for a rep", async () => {
    mockPrisma.fieldVisit.create.mockResolvedValue({ id: "v1", status: "PLANNED", plannedFor: new Date() });
    await svc().create(manager, { repId: "rep-1", placeName: "Shop", plannedFor: "2026-10-26" } as never, {});
    expect(mockPrisma.fieldVisit.create.mock.calls[0][0].data.repId).toBe("rep-1");
  });

  it("needs both coordinates for a pin", async () => {
    await expect(svc().create(rep, { placeName: "Shop", plannedFor: "2026-10-26", plannedLat: 6.7 } as never, {})).rejects.toThrow(BadRequestException);
  });

  it("check-in records the distance and VERIFIED when the rep is at the pin", async () => {
    mockPrisma.fieldVisit.findFirst.mockResolvedValue({ id: "v1", repId: "rep-1", status: "PLANNED", plannedFor: new Date(), plannedLat: 6.6885, plannedLon: -1.6244 });
    mockPrisma.fieldVisit.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: "v1", plannedFor: new Date(), ...data }));
    const out = await svc().checkIn(rep, "v1", { latitude: 6.6886, longitude: -1.6244, accuracyM: 12, source: "MOBILE" }, {});
    expect(out.data.verification).toBe("VERIFIED");
    expect(out.data.distanceM).toBeLessThan(50);
    expect(out.data.status).toBe("CHECKED_IN");
  });

  it("check-in far from the pin is flagged FAR", async () => {
    mockPrisma.fieldVisit.findFirst.mockResolvedValue({ id: "v1", repId: "rep-1", status: "PLANNED", plannedFor: new Date(), plannedLat: 6.6885, plannedLon: -1.6244 });
    mockPrisma.fieldVisit.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: "v1", plannedFor: new Date(), ...data }));
    const out = await svc().checkIn(rep, "v1", { latitude: 6.75, longitude: -1.7, accuracyM: 10, source: "MOBILE" }, {});
    expect(out.data.verification).toBe("FAR");
  });

  it("nobody can check in to another rep's visit, or check in twice", async () => {
    mockPrisma.fieldVisit.findFirst.mockResolvedValue({ id: "v1", repId: "someone-else", status: "PLANNED", plannedFor: new Date() });
    await expect(svc().checkIn(rep, "v1", { latitude: 1, longitude: 1, source: "WEB" }, {})).rejects.toThrow(ForbiddenException);
    mockPrisma.fieldVisit.findFirst.mockResolvedValue({ id: "v1", repId: "rep-1", status: "CHECKED_IN", plannedFor: new Date() });
    await expect(svc().checkIn(rep, "v1", { latitude: 1, longitude: 1, source: "WEB" }, {})).rejects.toThrow(/already checked in/);
  });

  it("a visit still PLANNED on a past day shows as MISSED", async () => {
    mockPrisma.fieldVisit.findMany.mockResolvedValue([{ id: "v1", repId: "rep-1", status: "PLANNED", plannedFor: new Date("2020-01-01") }]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "rep-1", fullName: "Mary" }]);
    const out = await svc().list(manager, { dateFrom: "2020-01-01", dateTo: "2020-01-01" }, false);
    expect(out.data[0].displayStatus).toBe("MISSED");
    expect(out.data[0].repName).toBe("Mary");
  });
});
