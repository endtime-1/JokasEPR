import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FinAuditService, RequestMeta } from "./fin-audit.service";
import { FinNumberingService } from "./fin-numbering.service";
import { UpdateFinSettingsDto } from "./dto/fin.dto";

/** Logos are stored inside the settings row (self-contained, no file serving needed). */
const MAX_LOGO_BYTES = 700 * 1024;
const LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function validateLogoDataUrl(value: string): void {
  const m = LOGO_PATTERN.exec(value);
  if (!m) throw new BadRequestException("The logo must be a PNG, JPEG or WebP image.");
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > MAX_LOGO_BYTES) throw new BadRequestException("The logo is too large. Please use an image under 700 KB.");
}

type SettingsRow = Awaited<ReturnType<PrismaService["finSettings"]["findUniqueOrThrow"]>>;

@Injectable()
export class FinSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly numbering: FinNumberingService
  ) {}

  /** Returns the company's settings, creating the default row the first time. */
  async get(companyId: string) {
    const row = await this.prisma.finSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
    await this.numbering.ensureDefaults(companyId);
    return this.present(row);
  }

  async getAll(companyId: string) {
    const [settings, sequences] = await Promise.all([this.get(companyId), this.numbering.list(companyId)]);
    return { settings, sequences };
  }

  async update(companyId: string, userId: string, dto: UpdateFinSettingsDto, meta: RequestMeta) {
    if (dto.logoDataUrl) validateLogoDataUrl(dto.logoDataUrl);
    if (dto.fiscalYearStartMonth !== undefined || dto.fiscalYearStartDay !== undefined) {
      const current = await this.prisma.finSettings.findUnique({ where: { companyId } });
      const month = dto.fiscalYearStartMonth ?? current?.fiscalYearStartMonth ?? 1;
      const day = dto.fiscalYearStartDay ?? current?.fiscalYearStartDay ?? 1;
      if (day > DAYS_IN_MONTH[month - 1]) throw new BadRequestException("That day does not exist in the chosen month.");
    }
    if (dto.businessName !== undefined && dto.businessName.trim().length === 0) {
      throw new BadRequestException("The business name cannot be empty.");
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.finSettings.upsert({ where: { companyId }, update: {}, create: { companyId } });
      const data = {
        ...(dto.businessName !== undefined ? { businessName: dto.businessName.trim() } : {}),
        ...(dto.legalName !== undefined ? { legalName: blankToNull(dto.legalName) } : {}),
        ...(dto.tin !== undefined ? { tin: blankToNull(dto.tin) } : {}),
        ...(dto.addressLine1 !== undefined ? { addressLine1: blankToNull(dto.addressLine1) } : {}),
        ...(dto.addressLine2 !== undefined ? { addressLine2: blankToNull(dto.addressLine2) } : {}),
        ...(dto.city !== undefined ? { city: blankToNull(dto.city) } : {}),
        ...(dto.region !== undefined ? { region: blankToNull(dto.region) } : {}),
        ...(dto.country !== undefined ? { country: dto.country.trim() || "Ghana" } : {}),
        ...(dto.phone !== undefined ? { phone: blankToNull(dto.phone) } : {}),
        ...(dto.email !== undefined ? { email: blankToNull(dto.email) } : {}),
        ...(dto.logoDataUrl !== undefined ? { logoDataUrl: dto.logoDataUrl || null } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.fiscalYearStartMonth !== undefined ? { fiscalYearStartMonth: dto.fiscalYearStartMonth } : {}),
        ...(dto.fiscalYearStartDay !== undefined ? { fiscalYearStartDay: dto.fiscalYearStartDay } : {}),
        updatedById: userId
      };
      const after = await tx.finSettings.update({ where: { id: before.id }, data });
      await this.audit.write(
        {
          companyId,
          userId,
          area: "settings",
          action: "UPDATE",
          entityType: "FinSettings",
          entityId: after.id,
          summary: "Updated finance settings",
          before: auditShape(before),
          after: auditShape(after),
          ...meta
        },
        tx
      );
      return this.present(after);
    });
  }

  private present(row: SettingsRow) {
    const { logoDataUrl, ...rest } = row;
    return { ...rest, hasLogo: Boolean(logoDataUrl), logoDataUrl };
  }
}

function blankToNull(v: string | null): string | null {
  if (v === null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** The audit log records what changed without storing the (large) logo image itself. */
function auditShape(row: SettingsRow) {
  const { logoDataUrl, createdAt: _c, updatedAt: _u, ...rest } = row;
  void _c;
  void _u;
  return { ...rest, hasLogo: Boolean(logoDataUrl), logoBytes: logoDataUrl ? logoDataUrl.length : 0 };
}
