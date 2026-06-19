import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly accountSid: string | undefined;
  private readonly authToken: string | undefined;
  private readonly fromNumber: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.accountSid = config.get<string>("TWILIO_ACCOUNT_SID");
    this.authToken = config.get<string>("TWILIO_AUTH_TOKEN");
    this.fromNumber = config.get<string>("TWILIO_FROM_NUMBER");
  }

  get isConfigured(): boolean {
    return !!(this.accountSid && this.authToken && this.fromNumber);
  }

  async send(to: string, body: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn("Twilio SMS not configured — skipping SMS to " + to);
      return false;
    }
    // Twilio REST API call (avoids requiring the heavy twilio SDK package)
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const params = new URLSearchParams({ To: to, From: this.fromNumber!, Body: body });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")
        },
        body: params.toString()
      });
      return res.ok;
    } catch (err) {
      this.logger.error(`SMS send failed to ${to}: ${(err as Error).message}`);
      return false;
    }
  }
}
