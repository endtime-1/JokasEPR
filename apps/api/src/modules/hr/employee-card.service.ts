import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import QRCode from "qrcode";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { getCompanyBranding } from "../../common/company-branding";
import { PrismaService } from "../prisma/prisma.service";

// Employee ID card and the QR scan that marks attendance.
//
// The QR on a card holds a short signed code, "JK1.<employee id>.<signature>". The signature is an HMAC of the
// company and employee ids, made with the server's own secret, so a code cannot be invented or edited: anything
// that does not verify is refused. A card can be replaced: the replacement carries a higher "version", and scanning an
// older version is refused, so a lost card is cancelled by issuing a new one. Versions live in one company setting. Scanning needs a signed-in HR user, so a stranger scanning a card with a phone
// learns nothing and records nothing. No database change: nothing is stored, the code is recomputed on demand.

const PREFIX = "JK1";

export const VERSIONS_KEY = "hr.idcard.versions";

/** Version 0 keeps the original short form, so every code issued before replacements existed stays valid. */
export function signEmployeeCode(secret: string, companyId: string, employeeId: string, version = 0): string {
  const message = version > 0 ? `jk-emp:${companyId}:${employeeId}:${version}` : `jk-emp:${companyId}:${employeeId}`;
  const sig = createHmac("sha256", secret).update(message).digest("base64url").slice(0, 22);
  return version > 0 ? `${PREFIX}.${employeeId}.${version}.${sig}` : `${PREFIX}.${employeeId}.${sig}`;
}

/** The employee and card version inside a genuine code for this company, or null when the code is not genuine. */
export function parseEmployeeCode(secret: string, companyId: string, raw: string): { employeeId: string; version: number } | null {
  const parts = String(raw ?? "").trim().split(".");
  if ((parts.length !== 3 && parts.length !== 4) || parts[0] !== PREFIX) return null;
  const employeeId = parts[1];
  if (!/^[0-9a-fA-F-]{36}$/.test(employeeId)) return null;
  let version = 0;
  if (parts.length === 4) {
    if (!/^[1-9][0-9]{0,5}$/.test(parts[2])) return null;
    version = Number(parts[2]);
  }
  const expected = Buffer.from(signEmployeeCode(secret, companyId, employeeId, version));
  const given = Buffer.from(String(raw).trim());
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { employeeId, version };
}

/** Kept for callers that only need to know whether a code is genuine. */
export function verifyEmployeeCode(secret: string, companyId: string, raw: string): string | null {
  return parseEmployeeCode(secret, companyId, raw)?.employeeId ?? null;
}

/** Permission that lets someone use the scanner without any other HR access. HR managers can scan too. */
export const SCAN_PERMISSION = "hr.attendance.scan";

export type ScanAction = "MARKED" | "ALREADY_MARKED";

type DayRecord = { id: string; status: string; checkInTime: Date | null } | null;

const PRESENT_LIKE = ["PRESENT", "LATE", "HALF_DAY"];

/**
 * Attendance is mostly Monday to Saturday but some Sundays are worked, and nobody scans a card on a day off, so a scan on any day counts.
 * What a scan means for today: the first scan marks the person present for the day, whether or not anyone had opened
 * attendance for the day; every later scan only reports that it is already marked. A day someone entered as present
 * by hand counts as marked too. A day entered as absent, on leave or a holiday is turned into present, because the
 * person has just turned up and scanned.
 */
export function decideScan(_now: Date, record: DayRecord): { action: ScanAction } {
  if (record && (record.checkInTime || PRESENT_LIKE.includes(record.status))) return { action: "ALREADY_MARKED" };
  return { action: "MARKED" };
}

@Injectable()
export class EmployeeCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService
  ) {}

  private secret(): string {
    return this.config.getOrThrow<string>("JWT_ACCESS_SECRET");
  }

  // Same location scoping the rest of HR applies to employee records.
  private scope(user: AuthenticatedUser): Record<string, unknown> {
    if (user.hasGlobalAccess) return {};
    const and: Record<string, unknown>[] = [];
    if (user.branchIds.length) and.push({ OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] });
    if (user.farmIds.length) and.push({ OR: [{ farmId: null }, { farmId: { in: user.farmIds } }] });
    if (user.warehouseIds.length) and.push({ OR: [{ warehouseId: null }, { warehouseId: { in: user.warehouseIds } }] });
    if (user.productionSiteIds.length) and.push({ OR: [{ productionSiteId: null }, { productionSiteId: { in: user.productionSiteIds } }] });
    return and.length ? { AND: and } : {};
  }

  private async versions(companyId: string): Promise<{ id: string | null; map: Record<string, number> }> {
    const row = await this.prisma.systemSetting.findFirst({ where: { companyId, key: VERSIONS_KEY, deletedAt: null }, select: { id: true, value: true } });
    const value = (row?.value ?? {}) as Record<string, unknown>;
    const map: Record<string, number> = {};
    for (const [k, v] of Object.entries(value)) if (typeof v === "number" && v > 0) map[k] = v;
    return { id: row?.id ?? null, map };
  }

  /** Cancel the employee's current card and make a new one: the old QR stops working at once. */
  async reissue(user: AuthenticatedUser, employeeId: string, context: { ipAddress?: string; userAgent?: string } = {}) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: user.companyId, deletedAt: null, ...this.scope(user) },
      select: { id: true, code: true, fullName: true }
    });
    if (!employee) throw new NotFoundException("Employee not found.");
    const { id, map } = await this.versions(user.companyId);
    const next = (map[employee.id] ?? 0) + 1;
    const value = { ...map, [employee.id]: next };
    if (id) await this.prisma.systemSetting.update({ where: { id }, data: { value, updatedById: user.id }, select: { id: true } });
    else await this.prisma.systemSetting.create({ data: { companyId: user.companyId, key: VERSIONS_KEY, value, description: "Current ID card version per employee", createdById: user.id }, select: { id: true } });
    await this.audit.write({
      companyId: user.companyId,
      actorUserId: user.id,
      entityType: "Employee",
      entityId: employee.id,
      action: "UPDATE",
      summary: `Replaced ID card for ${employee.fullName} (${employee.code}); the old card no longer works (version ${next})`,
      ...context
    });
    return this.getCard(user, employee.id);
  }

  /** Everything printed on the card, plus the QR code as SVG. Only fields that belong on an ID card are returned. */
  async getCard(user: AuthenticatedUser, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: user.companyId, deletedAt: null, ...this.scope(user) },
      select: {
        id: true, code: true, firstName: true, lastName: true, fullName: true, gender: true, phone: true,
        startDate: true, endDate: true, status: true, photoUrl: true,
        emergencyContactName: true, emergencyContactPhone: true,
        employeeRole: { select: { name: true } },
        branch: { select: { name: true, city: true } },
        farm: { select: { name: true } },
        company: { select: { name: true, legalName: true } }
      }
    });
    if (!employee) throw new NotFoundException("Employee not found.");
    const [{ map }, branding] = await Promise.all([this.versions(user.companyId), getCompanyBranding(this.prisma as never, user.companyId)]);
    const version = map[employee.id] ?? 0;
    const code = signEmployeeCode(this.secret(), user.companyId, employee.id, version);
    const qrSvg = await QRCode.toString(code, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#111111", light: "#ffffff" } });
    return {
      data: {
        id: employee.id,
        code: employee.code,
        fullName: employee.fullName,
        firstName: employee.firstName,
        lastName: employee.lastName,
        gender: employee.gender,
        phone: employee.phone,
        status: employee.status,
        startDate: employee.startDate,
        endDate: employee.endDate,
        photoUrl: employee.photoUrl,
        roleName: employee.employeeRole?.name ?? null,
        locationName: employee.branch?.name ?? employee.farm?.name ?? null,
        emergencyContactName: employee.emergencyContactName,
        emergencyContactPhone: employee.emergencyContactPhone,
        companyName: employee.company?.name ?? null,
        companyLegalName: employee.company?.legalName ?? null,
        companyAddress: branding.address,
        companyLogoUrl: branding.logoUrl,
        cardVersion: version,
        qrCode: code,
        qrSvg
      }
    };
  }

  private assertMayScan(user: AuthenticatedUser) {
    if (user.hasGlobalAccess || user.permissions.includes(SCAN_PERMISSION) || user.permissions.includes("hr.manage")) return;
    throw new ForbiddenException("You do not have permission to scan attendance cards.");
  }

  /** A card was scanned: mark today's attendance once; later scans the same day only say it is already marked. */
  async scan(user: AuthenticatedUser, rawCode: string, context: { ipAddress?: string; userAgent?: string } = {}) {
    this.assertMayScan(user);
    const parsed = parseEmployeeCode(this.secret(), user.companyId, rawCode);
    if (!parsed) throw new BadRequestException("This is not a valid employee card.");
    const employeeId = parsed.employeeId;
    const { map } = await this.versions(user.companyId);
    if (parsed.version !== (map[employeeId] ?? 0)) throw new ForbiddenException("This card has been replaced by a newer one and no longer works. Attendance was not recorded.");

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: user.companyId, deletedAt: null, ...this.scope(user) },
      select: { id: true, code: true, fullName: true, status: true, photoUrl: true, employeeRole: { select: { name: true } }, branch: { select: { name: true } } }
    });
    if (!employee) throw new NotFoundException("This card belongs to someone you cannot record attendance for.");
    if (employee.status !== "ACTIVE") throw new ForbiddenException(`${employee.fullName} is not an active employee (${String(employee.status).toLowerCase()}). Attendance was not recorded.`);

    const now = new Date();
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { companyId_employeeId_date: { companyId: user.companyId, employeeId: employee.id, date } },
      select: { id: true, status: true, checkInTime: true }
    });
    const decision = decideScan(now, existing);

    let markedAt: Date | null = existing?.checkInTime ?? null;
    if (decision.action === "MARKED") {
      const data = { checkInTime: now, status: "PRESENT" as const, recordedById: user.id, notes: "QR card scan" };
      const row = existing
        ? await this.prisma.attendanceRecord.update({ where: { id: existing.id }, data, select: { id: true } })
        : await this.prisma.attendanceRecord.create({ data: { companyId: user.companyId, employeeId: employee.id, date, ...data }, select: { id: true } });
      markedAt = now;
      await this.audit.write({
        companyId: user.companyId,
        actorUserId: user.id,
        entityType: "AttendanceRecord",
        entityId: row.id,
        action: existing ? "UPDATE" : "CREATE",
        summary: `QR card scan: marked ${employee.fullName} (${employee.code}) present for the day`,
        ...context
      });
    }

    return {
      data: {
        action: decision.action,
        at: now.toISOString(),
        markedAt,
        employee: {
          id: employee.id,
          code: employee.code,
          fullName: employee.fullName,
          photoUrl: employee.photoUrl,
          roleName: employee.employeeRole?.name ?? null,
          locationName: employee.branch?.name ?? null
        }
      }
    };
  }
}
