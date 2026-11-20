import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../notifications/email.service";
import { FinLinksService } from "./fin-links.service";
import { parseDay, dayString } from "./fin-ledger.service";
import { daysBetween } from "./fin-sales-math";
import { FinSettingsService } from "./fin-settings.service";

export type ReminderMessage = {
  companyId: string;
  invoiceId: string;
  to: string;
  subject: string;
  html: string;
  /** Plain text for channels that have no HTML (SMS, WhatsApp). */
  text: string;
};

/**
 * A way of getting a reminder to a customer. Email is the first one. To add SMS later, write a class like
 * EmailReminderChannel (name "SMS", address = the contact's phone) and pass it to FinReminderService.addChannel().
 * Nothing else changes: the schedule, the once-only log and the wording all live in the service.
 */
export interface ReminderChannel {
  readonly name: string;
  /** false = not set up on this server yet; the channel is skipped and nothing is logged, so it works once it is configured. */
  isConfigured(): boolean;
  /** Where to send, from the customer's record; null = this customer has no address for this channel. */
  address(contact: { email: string | null; phone: string | null }): string | null;
  send(msg: ReminderMessage): Promise<boolean>;
}

export class EmailReminderChannel implements ReminderChannel {
  readonly name = "EMAIL";
  constructor(private readonly email: EmailService) {}
  isConfigured() {
    return this.email.isConfigured;
  }
  address(contact: { email: string | null }) {
    return contact.email;
  }
  send(msg: ReminderMessage) {
    return this.email.send(msg.to, msg.subject, msg.html);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/**
 * Overdue reminders. A customer gets at most one reminder per step (1, 7 and 14 days overdue) per channel, ever:
 * the (invoice, step, channel) log row is unique. If several steps were missed (say the server was off), only the
 * latest one is sent and the earlier ones are recorded as skipped, so nobody receives three emails at once.
 */
@Injectable()
export class FinReminderService {
  private readonly logger = new Logger(FinReminderService.name);
  static readonly STEPS = [1, 7, 14];
  private channels: ReminderChannel[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly links: FinLinksService,
    private readonly settings: FinSettingsService
  ) {
    this.channels = [new EmailReminderChannel(email)];
  }

  /** The hook for future channels (SMS, WhatsApp). */
  addChannel(channel: ReminderChannel) {
    this.channels.push(channel);
  }

  async run(today: Date = parseDay(new Date()), companyId?: string): Promise<{ sent: number; skipped: number; failed: number }> {
    const overdue = await this.prisma.finInvoice.findMany({
      where: { status: "SENT", paymentStatus: { in: ["UNPAID", "PARTIAL"] }, dueDate: { lt: today }, linkEnabled: true, ...(companyId ? { companyId } : {}) },
      include: { contact: true },
      take: 2000
    });
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const businessCache = new Map<string, { name: string; currency: string }>();

    for (const inv of overdue) {
      const days = daysBetween(inv.dueDate, today);
      const reached = FinReminderService.STEPS.filter((s) => days >= s);
      if (reached.length === 0) continue;
      const latest = Math.max(...reached);

      for (const ch of this.channels) {
        if (!ch.isConfigured()) continue;
        const logged = await this.prisma.finReminderLog.findMany({ where: { invoiceId: inv.id, channel: ch.name }, select: { step: true } });
        const done = new Set(logged.map((l) => l.step));
        if (done.has(latest)) continue;

        // Earlier steps that were never sent are recorded as skipped, not sent late.
        for (const s of reached.filter((x) => x < latest && !done.has(x))) {
          await this.log(inv.companyId, inv.id, s, ch.name, null, "SKIPPED", "A later reminder was due");
          skipped++;
        }

        const to = ch.address(inv.contact);
        if (!to) {
          await this.log(inv.companyId, inv.id, latest, ch.name, null, "SKIPPED", "No address for this customer");
          skipped++;
          continue;
        }
        if (!businessCache.has(inv.companyId)) {
          const s = await this.settings.get(inv.companyId);
          businessCache.set(inv.companyId, { name: s.businessName || "us", currency: s.currency });
        }
        const biz = businessCache.get(inv.companyId)!;
        const link = this.links.invoiceLink(inv.id, inv.linkVersion);
        const balance = `${biz.currency} ${Number(inv.balanceDue).toFixed(2)}`;
        const subject = `Reminder: invoice ${inv.number} is ${days} day${days === 1 ? "" : "s"} overdue`;
        const text = `Hello ${inv.contact.name}, invoice ${inv.number} (${balance}) was due on ${dayString(inv.dueDate)} and is still unpaid. View it here: ${link}. If you have already paid, please ignore this message. Thank you, ${biz.name}.`;
        const html = `<p>Hello ${esc(inv.contact.name)},</p><p>Invoice <b>${esc(inv.number ?? "")}</b> for <b>${esc(balance)}</b> was due on ${esc(dayString(inv.dueDate))} and is still unpaid.</p><p><a href="${esc(link)}">View or download the invoice</a></p><p>If you have already paid, please ignore this message.</p><p>Thank you,<br>${esc(biz.name)}</p>`;
        try {
          const ok = await ch.send({ companyId: inv.companyId, invoiceId: inv.id, to, subject, html, text });
          if (ok) {
            await this.log(inv.companyId, inv.id, latest, ch.name, to, "SENT", null);
            sent++;
          } else {
            failed++; // not logged: it is tried again at the next run
          }
        } catch (err) {
          failed++;
          this.logger.warn(`Reminder for ${inv.number} via ${ch.name} failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    return { sent, skipped, failed };
  }

  private async log(companyId: string, invoiceId: string, step: number, channel: string, to: string | null, status: string, error: string | null) {
    try {
      await this.prisma.finReminderLog.create({ data: { companyId, invoiceId, step, channel, toAddress: to, status, error } });
    } catch (err) {
      if ((err as { code?: string })?.code !== "P2002") throw err; // already logged by a concurrent run
    }
  }
}
