import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: any = null;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>("SMTP_HOST");
    if (host) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port: parseInt(config.get<string>("SMTP_PORT", "587"), 10),
          secure: parseInt(config.get<string>("SMTP_PORT", "587"), 10) === 465,
          auth: {
            user: config.get<string>("SMTP_USER"),
            pass: config.get<string>("SMTP_PASS")
          }
        });
      } catch (err) {
        this.logger.warn(`Failed to initialize SMTP transport; email notifications are disabled: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn("SMTP not configured — skipping email to " + to);
      return false;
    }
    const from = `"${this.config.get("SMTP_FROM_NAME", "Jokas ERP")}" <${this.config.get("SMTP_FROM_ADDRESS", "noreply@jokas.app")}>`;
    try {
      await this.transporter.sendMail({ from, to, subject, html });
      return true;
    } catch (err) {
      this.logger.error(`Email send failed to ${to}: ${(err as Error).message}`);
      return false;
    }
  }

  async sendWithAttachment(to: string, subject: string, html: string, attachment: { filename: string; content: Buffer }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn("SMTP not configured — skipping email with attachment to " + to);
      return false;
    }
    const from = `"${this.config.get("SMTP_FROM_NAME", "Jokas ERP")}" <${this.config.get("SMTP_FROM_ADDRESS", "noreply@jokas.app")}>`;
    try {
      await this.transporter.sendMail({ from, to, subject, html, attachments: [{ filename: attachment.filename, content: attachment.content }] });
      return true;
    } catch (err) {
      this.logger.error(`Email with attachment failed to ${to}: ${(err as Error).message}`);
      return false;
    }
  }
}
