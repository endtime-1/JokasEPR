import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateFieldVisitDto, FieldVisitCheckInDto, FieldVisitQueryDto } from "./dto/field-visit.dto";

type Ctx = { ipAddress?: string; userAgent?: string };

// A check-in is "VERIFIED" when it is within this many metres of the planned pin
// (or within the phone's own reported accuracy, whichever is larger, up to a cap).
export const VERIFY_RADIUS_M = 300;
// Worse than this and the position cannot be trusted either way (typical of a laptop on Wi-Fi).
export const LOW_ACCURACY_M = 1000;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// VERIFIED: within range of the pin. FAR: clearly somewhere else. LOW_ACCURACY: the position is
// too rough to say (the manager should look at the map). UNPINNED: no planned pin to compare with.
export function verify(distanceM: number | null, accuracyM: number | null): "VERIFIED" | "FAR" | "LOW_ACCURACY" | "UNPINNED" {
  if (distanceM === null) return "UNPINNED";
  const allowed = Math.max(VERIFY_RADIUS_M, Math.min(accuracyM ?? 0, 500));
  if (distanceM <= allowed) return "VERIFIED";
  if ((accuracyM ?? 0) > LOW_ACCURACY_M && distanceM <= (accuracyM ?? 0)) return "LOW_ACCURACY";
  return "FAR";
}

function dayStart(s: string): Date {
  const d = new Date(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class FieldVisitsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private canManage(user: AuthenticatedUser) {
    return user.hasGlobalAccess || user.permissions.includes(PERMISSIONS.SALES_MANAGE);
  }

  private decorate<T extends { plannedFor: Date; status: string }>(row: T) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    // A visit still PLANNED on a past day was never checked in: it was missed.
    const displayStatus = row.status === "PLANNED" && row.plannedFor < todayStart ? "MISSED" : row.status;
    return { ...row, displayStatus };
  }

  async create(user: AuthenticatedUser, dto: CreateFieldVisitDto, ctx: Ctx) {
    const repId = dto.repId ?? user.id;
    if (repId !== user.id && !this.canManage(user)) throw new ForbiddenException("Only a sales manager can plan visits for someone else.");
    if ((dto.plannedLat === undefined) !== (dto.plannedLon === undefined)) throw new BadRequestException("Give both latitude and longitude for the pin, or neither.");
    const rep = await this.prisma.user.findFirst({ where: { id: repId, companyId: user.companyId, deletedAt: null }, select: { id: true } });
    if (!rep) throw new BadRequestException("That user was not found.");
    const row = await this.prisma.fieldVisit.create({
      data: {
        companyId: user.companyId, branchId: dto.branchId, repId, customerId: dto.customerId, placeName: dto.placeName.trim(),
        address: dto.address, purpose: dto.purpose, plannedFor: dayStart(dto.plannedFor),
        plannedLat: dto.plannedLat, plannedLon: dto.plannedLon, createdById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "CREATE", entityType: "FieldVisit", entityId: row.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { data: this.decorate(row) };
  }

  async checkIn(user: AuthenticatedUser, id: string, dto: FieldVisitCheckInDto, ctx: Ctx) {
    const visit = await this.prisma.fieldVisit.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!visit) throw new NotFoundException("Visit not found.");
    if (visit.repId !== user.id) throw new ForbiddenException("You can only check in to your own visits.");
    if (visit.status === "CHECKED_IN") throw new BadRequestException("You have already checked in to this visit.");
    if (visit.status === "CANCELLED") throw new BadRequestException("This visit was cancelled.");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (visit.plannedFor > new Date(today.getTime() + 86400000 - 1)) throw new BadRequestException("This visit is planned for a later day.");

    const accuracy = dto.accuracyM !== undefined ? Math.round(dto.accuracyM) : null;
    const distance = visit.plannedLat !== null && visit.plannedLon !== null
      ? haversineM(Number(visit.plannedLat), Number(visit.plannedLon), dto.latitude, dto.longitude) : null;
    const verification = verify(distance, accuracy);
    const row = await this.prisma.fieldVisit.update({
      where: { id },
      data: {
        status: "CHECKED_IN", checkedInAt: new Date(), checkInLat: dto.latitude, checkInLon: dto.longitude,
        accuracyM: accuracy, distanceM: distance, verification, checkInSource: dto.source, checkInNote: dto.note,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "FieldVisit", entityId: id, summary: `Checked in (${verification}${distance !== null ? `, ${distance} m` : ""})`, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { data: this.decorate(row) };
  }

  async cancel(user: AuthenticatedUser, id: string, ctx: Ctx) {
    const visit = await this.prisma.fieldVisit.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!visit) throw new NotFoundException("Visit not found.");
    if (visit.repId !== user.id && !this.canManage(user)) throw new ForbiddenException("Not allowed.");
    if (visit.status === "CHECKED_IN") throw new BadRequestException("A visit that was checked in cannot be cancelled.");
    await this.prisma.fieldVisit.update({ where: { id }, data: { status: "CANCELLED" } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "UPDATE", entityType: "FieldVisit", entityId: id, summary: "Cancelled", ipAddress: ctx.ipAddress, userAgent: ctx.userAgent });
    return { success: true };
  }

  async list(user: AuthenticatedUser, query: FieldVisitQueryDto, onlyMine: boolean) {
    const where: Record<string, unknown> = { companyId: user.companyId, deletedAt: null };
    if (onlyMine) where.repId = user.id;
    else if (query.repId) where.repId = query.repId;
    if (query.status && query.status !== "ALL") where.status = query.status;
    const from = query.dateFrom ? dayStart(query.dateFrom) : dayStart(new Date().toISOString());
    const to = query.dateTo ? dayStart(query.dateTo) : from;
    where.plannedFor = { gte: from, lte: to };
    const rows = await this.prisma.fieldVisit.findMany({ where, orderBy: [{ plannedFor: "desc" }, { createdAt: "desc" }], take: 500 });
    const repIds = [...new Set(rows.map((r) => r.repId))];
    const reps = repIds.length ? await this.prisma.user.findMany({ where: { id: { in: repIds } }, select: { id: true, fullName: true } }) : [];
    const names = new Map(reps.map((r) => [r.id, r.fullName]));
    return { data: rows.map((r) => ({ ...this.decorate(r), repName: names.get(r.repId) ?? "—" })) };
  }
}
