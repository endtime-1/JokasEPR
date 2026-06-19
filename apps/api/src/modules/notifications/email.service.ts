import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: any = null;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>("SMTP_HOST");
    if (host) {
      try {
        const nodemailer = require("nodemailer");
        this.transporter = nodemailer.createTransport({
          host,
          port: parseInt(config.get<string>("SMTP_PORT", "587"), 10),
          secure: parseInt(config.get<string>("SMTP_PORT", "587"), 10) === 465,
          auth: {
            user: config.get<string>("SMTP_USER"),
            pass: config.get<string>("SMTP_PASS")
          }
        });
      } catch {
        this.logger.warn("Nodemailer is not installed; email notifications are disabled.");
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
}
