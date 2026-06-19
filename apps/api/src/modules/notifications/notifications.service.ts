import { ForbiddenException, Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "./email.service";
import { SmsService } from "./sms.service";
import { WhatsAppService } from "./whatsapp.service";
import { NotificationQueryDto, NotificationType, SendNotificationPayload, UpdateNotificationConfigDto, UpdatePreferencesDto } from "./dto/notifications.dto";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly sms: SmsService,
    private readonly whatsapp: WhatsAppService
  ) {}

  // ── Internal: dispatch a notification to one user ──────────────────────────

  async send(payload: SendNotificationPayload): Promise<void> {
    const { companyId, userId, type, title, body, entityType, entityId, metadata } = payload;

    // Resolve user preferences (fall back to in-app only)
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_notificationType: { userId, notificationType: type as any } }
    });

    const inApp = pref ? pref.inApp : true;
    const sendEmail = pref ? pref.email : false;
    const sendSms = pref ? pref.sms : false;
    const sendWhatsapp = pref ? pref.whatsapp : false;

    const channels: string[] = [];

    if (inApp) {
      await this.prisma.notification.create({
        data: {
          companyId,
          userId,
          type: type as any,
          channel: "IN_APP",
          title,
          body,
          entityType,
          entityId,
          metadata: metadata as any
        }
      });
    }

    // Fetch user contact details only if needed
    if (sendEmail || sendSms || sendWhatsapp) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
      if (!user) return;

      if (sendEmail && this.email.isConfigured) {
        const sent = await this.email.send(
          user.email,
          title,
          `<p>${body}</p><p style="color:#888;font-size:12px">Jokas ERP Notification</p>`
        );
        if (sent) channels.push("email");
        await this.prisma.notification.create({
          data: { companyId, userId, type: type as any, channel: "EMAIL", title, body, entityType, entityId, metadata: metadata as any, sentAt: sent ? new Date() : undefined }
        });
      }

      if (sendSms && this.sms.isConfigured && user.phone) {
        const sent = await this.sms.send(user.phone, `${title}: ${body}`);
        if (sent) channels.push("sms");
        await this.prisma.notification.create({
          data: { companyId, userId, type: type as any, channel: "SMS", title, body, entityType, entityId, metadata: metadata as any, sentAt: sent ? new Date() : undefined }
        });
      }

      if (sendWhatsapp && this.whatsapp.isConfigured && user.phone) {
        const sent = await this.whatsapp.send(user.phone, `*${title}*\n${body}`);
        if (sent) channels.push("whatsapp");
        await this.prisma.notification.create({
          data: { companyId, userId, type: type as any, channel: "WHATSAPP", title, body, entityType, entityId, metadata: metadata as any, sentAt: sent ? new Date() : undefined }
        });
      }
    }

    void channels; // suppress unused warning
  }

  // ── Broadcast to all users in a company with a given permission ─────────────

  async broadcast(companyId: string, requiredPermission: string | null, payload: Omit<SendNotificationPayload, "companyId" | "userId">): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { companyId, status: "ACTIVE", deletedAt: null },
      select: { id: true, roles: { select: { role: { select: { permissions: { select: { key: true } } } } } } }
    });

    for (const user of users) {
      if (requiredPermission) {
        const perms = user.roles.flatMap((r) => r.role.permissions.map((p) => p.key));
        if (!perms.includes(requiredPermission)) continue;
      }
      await this.send({ companyId, userId: user.id, ...payload });
    }
  }

  // ── REST endpoints ──────────────────────────────────────────────────────────

  async findAll(user: AuthenticatedUser, query: NotificationQueryDto) {
    const where: any = { companyId: user.companyId, userId: user.id };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    const limit = Math.min(query.limit ?? 30, 100);
    const offset = query.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      this.prisma.notification.count({ where })
    ]);

    return { data: { data, total } };
  }

  async unreadCount(user: AuthenticatedUser) {
    const count = await this.prisma.notification.count({
      where: { companyId: user.companyId, userId: user.id, status: "UNREAD", channel: "IN_APP" }
    });
    return { data: { count } };
  }

  async markRead(user: AuthenticatedUser, id: string) {
    const notif = await this.prisma.notification.findFirst({ where: { id, userId: user.id, companyId: user.companyId } });
    if (!notif) throw new ForbiddenException("Notification not found.");
    const updated = await this.prisma.notification.update({ where: { id }, data: { status: "READ", readAt: new Date() } });
    return { data: updated };
  }

  async markAllRead(user: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({
      where: { companyId: user.companyId, userId: user.id, status: "UNREAD" },
      data: { status: "READ", readAt: new Date() }
    });
    return { data: { updated: result.count } };
  }

  // ── Preferences ─────────────────────────────────────────────────────────────

  private async buildPreferences(userId: string) {
    const saved = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const savedMap = new Map(saved.map((p) => [p.notificationType, p]));
    return Object.values(NotificationType).map((type) => {
      const existing = savedMap.get(type as any);
      return {
        notificationType: type,
        inApp: existing?.inApp ?? true,
        email: existing?.email ?? false,
        sms: existing?.sms ?? false,
        whatsapp: existing?.whatsapp ?? false
      };
    });
  }

  async getPreferences(user: AuthenticatedUser) {
    return { data: await this.buildPreferences(user.id) };
  }

  async updatePreferences(user: AuthenticatedUser, dto: UpdatePreferencesDto) {
    await Promise.all(
      dto.preferences.map((p) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_notificationType: { userId: user.id, notificationType: p.notificationType as any } },
          create: { userId: user.id, companyId: user.companyId, notificationType: p.notificationType as any, inApp: p.inApp, email: p.email, sms: p.sms, whatsapp: p.whatsapp },
          update: { inApp: p.inApp, email: p.email, sms: p.sms, whatsapp: p.whatsapp }
        })
      )
    );
    return { data: await this.buildPreferences(user.id) };
  }

  // ── Admin: notification config ──────────────────────────────────────────────

  private requireAdmin(user: AuthenticatedUser) {
    const adminRoles = ["SUPER_ADMIN", "CEO"];
    if (!user.roles.some((r) => adminRoles.includes(r))) {
      throw new ForbiddenException("Admin access required.");
    }
  }

  async getConfig(user: AuthenticatedUser) {
    this.requireAdmin(user);
    const config = await this.prisma.notificationConfig.findUnique({ where: { companyId: user.companyId } });
    return { data: config ?? { companyId: user.companyId, emailEnabled: false, smsEnabled: false, whatsappEnabled: false, emailFromAddress: null, emailFromName: null } };
  }

  async updateConfig(user: AuthenticatedUser, dto: UpdateNotificationConfigDto) {
    this.requireAdmin(user);
    const config = await this.prisma.notificationConfig.upsert({
      where: { companyId: user.companyId },
      create: { companyId: user.companyId, ...dto },
      update: { ...dto }
    });
    return { data: config };
  }
}
