import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AiDataService } from "./ai-data.service";
import { AiChatDto } from "./dto/ai-chat.dto";

const SYSTEM_PROMPT = `You are Jokas ERP Assistant, an AI business advisor for Jokas Agribusiness.
You answer questions using only the company data provided below. Do not guess or fabricate numbers.
Be concise, specific, and actionable. When data is missing, say so clearly.

IMPORTANT DISCLAIMER: All insights are advisory only. Always validate with operational teams before making decisions.
Do not expose individual user credentials, passwords, or personally identifiable information.
`;

const MAX_HISTORY_MESSAGES = 10;
const FALLBACK_MODEL_OPTIONS = ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"];

type AiMessageParam = {
  role: "user" | "assistant";
  content: string;
};

type AiProviderResponse = {
  content: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly data: AiDataService
  ) {
    this.apiKey = this.config.get<string>("AI_API_KEY");
  }

  private configuredModels(): string[] {
    const defaultModel = this.config.get<string>("AI_MODEL", FALLBACK_MODEL_OPTIONS[0]).trim();
    const configured = this.config
      .get<string>("AI_MODELS", "")
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean);

    return [...new Set([defaultModel, ...configured, ...FALLBACK_MODEL_OPTIONS])];
  }

  private defaultModel(): string {
    return this.config.get<string>("AI_MODEL", this.configuredModels()[0]).trim();
  }

  private resolveModel(requestedModel?: string): string {
    const models = this.configuredModels();
    const selected = requestedModel?.trim() || this.defaultModel();
    if (!models.includes(selected)) {
      throw new BadRequestException("Selected AI model is not enabled.");
    }
    return selected;
  }

  async chat(user: AuthenticatedUser, dto: AiChatDto, ipAddress?: string, userAgent?: string) {
    if (!user.permissions.includes("ai.read")) {
      throw new ForbiddenException("AI assistant access is not enabled for your account.");
    }

    if (!this.apiKey) {
      throw new ForbiddenException("AI assistant is not configured. Please set AI_API_KEY.");
    }

    const model = this.resolveModel(dto.model);

    // Resolve or create session
    let session = dto.sessionId
      ? await this.prisma.aiChatSession.findFirst({ where: { id: dto.sessionId, userId: user.id } })
      : null;

    if (!session) {
      session = await this.prisma.aiChatSession.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          title: dto.message.slice(0, 80)
        }
      });
    }

    // Load recent history
    const history = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES
    });
    history.reverse();

    // Build data context filtered by user permissions
    const dataContext = await this.data.buildContext(user);

    // Save user message
    await this.prisma.aiChatMessage.create({
      data: { sessionId: session.id, role: "user", content: dto.message }
    });

    const messages: AiMessageParam[] = [
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: dto.message }
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: `${SYSTEM_PROMPT}\n\n--- LIVE COMPANY DATA (${new Date().toISOString().slice(0, 10)}) ---\n${dataContext}\n--- END DATA ---`,
        messages
      })
    });

    if (!response.ok) {
      this.logger.warn(`AI provider request failed with status ${response.status}`);
      throw new ForbiddenException("AI assistant provider request failed.");
    }

    const aiResponse = (await response.json()) as AiProviderResponse;
    const replyBlock = aiResponse.content.find((c) => c.type === "text");
    const reply = replyBlock?.text ?? "No response generated.";

    // Save assistant message
    await this.prisma.aiChatMessage.create({
      data: { sessionId: session.id, role: "assistant", content: reply }
    });

    // Audit log
    await this.audit.write({
      companyId: user.companyId,
      actorUserId: user.id,
      action: "CREATE",
      entityType: "AiChatMessage",
      entityId: session.id,
      summary: `AI query: ${dto.message.slice(0, 120)}`,
      metadata: { sessionId: session.id, model, inputTokens: aiResponse.usage?.input_tokens ?? 0, outputTokens: aiResponse.usage?.output_tokens ?? 0 },
      ipAddress,
      userAgent
    });

    return {
      data: {
        sessionId: session.id,
        model,
        reply,
        disclaimer: "AI insights are advisory only. Validate with your operational teams before acting."
      }
    };
  }

  async models(user: AuthenticatedUser) {
    if (!user.permissions.includes("ai.read")) {
      throw new ForbiddenException("AI assistant access is not enabled for your account.");
    }

    const defaultModel = this.defaultModel();
    return {
      data: this.configuredModels().map((id) => ({
        id,
        label: id
          .replace(/^claude-/, "Claude ")
          .replace(/-/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        isDefault: id === defaultModel
      }))
    };
  }

  async sessions(user: AuthenticatedUser) {
    if (!user.permissions.includes("ai.read")) {
      throw new ForbiddenException("AI assistant access is not enabled for your account.");
    }

    const sessions = await this.prisma.aiChatSession.findMany({
      where: { companyId: user.companyId, userId: user.id },
      select: {
        id: true, title: true, createdAt: true, updatedAt: true,
        _count: { select: { messages: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 20
    });

    return { data: sessions };
  }

  async sessionMessages(user: AuthenticatedUser, sessionId: string) {
    if (!user.permissions.includes("ai.read")) {
      throw new ForbiddenException("AI assistant access is not enabled for your account.");
    }

    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId: user.id, companyId: user.companyId }
    });

    if (!session) {
      throw new ForbiddenException("Session not found.");
    }

    const messages = await this.prisma.aiChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" }
    });

    return { data: { session, messages } };
  }

  async deleteSession(user: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId: user.id, companyId: user.companyId }
    });

    if (!session) {
      throw new ForbiddenException("Session not found.");
    }

    await this.prisma.aiChatSession.delete({ where: { id: sessionId } });
    return { data: { success: true } };
  }
}
