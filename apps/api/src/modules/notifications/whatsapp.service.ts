import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiUrl: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly fromNumber: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = config.get<string>("WHATSAPP_API_URL");
    this.apiToken = config.get<string>("WHATSAPP_API_TOKEN");
    this.fromNumber = config.get<string>("WHATSAPP_FROM_NUMBER");
  }

  get isConfigured(): boolean {
    return !!(this.apiUrl && this.apiToken && this.fromNumber);
  }

  async send(to: string, body: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn("WhatsApp API not configured — skipping message to " + to);
      return false;
    }
    // Meta Cloud API format
    try {
      const res = await fetch(`${this.apiUrl}/${this.fromNumber}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiToken}`
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body }
        })
      });
      return res.ok;
    } catch (err) {
      this.logger.error(`WhatsApp send failed to ${to}: ${(err as Error).message}`);
      return false;
    }
  }
}
