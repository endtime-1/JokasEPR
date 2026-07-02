import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AiDataService } from "./ai-data.service";
import { AiChatDto } from "./dto/ai-chat.dto";

// ── Provider types ───────────────────────────────────────────────────────────

type Provider = "anthropic" | "gemini" | "groq" | "nvidia" | "openrouter";

type AiMessageParam = { role: "user" | "assistant"; content: string };

// ── System prompts ───────────────────────────────────────────────────────────

const BASE_PROMPT = `You are Jokas ERP Assistant, an AI advisor for Jokas Agribusiness.
Answer using only the company data provided. Be concise, specific, and actionable.
When data is missing, say so clearly. Do not fabricate numbers.
DISCLAIMER: All insights are advisory only. Validate with your teams before acting.`;

const FEED_ANALYSIS_PROMPT = `You are a poultry nutrition and cost advisor for Jokas Agribusiness.
Given flock batch data and feed records, provide:
1. Whether the feed rate (g/bird/day) is within normal range for the bird type and age
2. Cost efficiency analysis (cost per kg, cost per bird, cost per egg if applicable)
3. Any anomalies or concerns
4. A concrete recommendation (increase/decrease feed, check supplier pricing, etc.)
Be concise. Use bullet points. Do not fabricate data not provided.`;

const ANOMALY_PROMPT = `You are a poultry operations analyst for Jokas Agribusiness.
Analyse the provided flock and farm data for anomalies. Look for:
- Mortality spikes (>2% of flock in a day is a concern)
- Egg production drops (>10% day-on-day drop is significant)
- Feed consumption outliers
- Weight gain deviations from expected growth curve
For each anomaly found: name it, rate severity (LOW/MEDIUM/HIGH), and suggest one action.
If no anomalies found, say so clearly. Use plain language workers can understand.`;

const REPORT_SUMMARY_PROMPT = `You are a farm report writer for Jokas Agribusiness.
Summarise the provided data into a brief plain-English farm performance report.
Structure: Opening sentence with overall status then 3-5 bullet highlights then 1 closing recommendation.
Keep it under 200 words. No jargon. A non-technical farm owner should understand it immediately.`;

const MAX_HISTORY = 10;
const FALLBACK_MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"];
const AI_TIMEOUT_MS = 30_000;   // abort provider fetch after 30 s
const AI_RATE_LIMIT = 20;       // max requests per user per minute
const AI_RATE_WINDOW_MS = 60_000;

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly rateLimitMap = new Map<string, { count: number; windowEnd: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly data: AiDataService
  ) {}

  private detectProvider(model: string): Provider {
    if (model.startsWith("gemini")) return "gemini";
    if (model.includes("/")) {
      // org/model format — prefer OpenRouter if key is present, else NVIDIA NIM
      return this.config.get("OPENROUTER_API_KEY") ? "openrouter" : "nvidia";
    }
    if (model.startsWith("llama") || model.startsWith("mixtral") || model.startsWith("qwen")) return "groq";
    return "anthropic";
  }

  private keyFor(provider: Provider): string | undefined {
    switch (provider) {
      case "openrouter": return this.config.get("OPENROUTER_API_KEY") || undefined;
      case "nvidia":     return this.config.get("NVIDIA_API_KEY") || undefined;
      case "anthropic":  return this.config.get("ANTHROPIC_API_KEY") || this.config.get("AI_API_KEY") || undefined;
      case "gemini":     return this.config.get("GEMINI_API_KEY") || undefined;
      case "groq":       return this.config.get("GROQ_API_KEY") || undefined;
    }
  }

  private defaultModel(): string {
    return this.config.get<string>("AI_MODEL", FALLBACK_MODELS[0]).trim();
  }

  private configuredModels(): string[] {
    const extra = (this.config.get<string>("AI_MODELS", "") ?? "")
      .split(",").map((m) => m.trim()).filter(Boolean);
    return [...new Set([this.defaultModel(), ...extra, ...FALLBACK_MODELS])];
  }

  private availableModels(): string[] {
    return this.configuredModels().filter((id) => !!this.keyFor(this.detectProvider(id)));
  }

  private resolveModel(requested?: string): string {
    const available = this.availableModels();
    const selected = requested?.trim() || this.defaultModel();
    if (!available.includes(selected)) throw new BadRequestException("Selected AI model is not available.");
    return selected;
  }

  private enforceRateLimit(userId: string): void {
    const now = Date.now();
    const entry = this.rateLimitMap.get(userId);
    if (!entry || now > entry.windowEnd) {
      this.rateLimitMap.set(userId, { count: 1, windowEnd: now + AI_RATE_WINDOW_MS });
      return;
    }
    if (entry.count >= AI_RATE_LIMIT) {
      throw new ForbiddenException(`AI rate limit reached. Max ${AI_RATE_LIMIT} requests per minute.`);
    }
    entry.count++;
  }

  // ── Provider call dispatcher ─────────────────────────────────────────────────

  private async callAi(
    model: string, systemPrompt: string, messages: AiMessageParam[], maxTokens = 1024,
    userId?: string
  ): Promise<{ reply: string; inputTokens: number; outputTokens: number }> {
    if (userId) this.enforceRateLimit(userId);
    const provider = this.detectProvider(model);
    const key = this.keyFor(provider);
    if (!key) {
      throw new ForbiddenException(
        `AI provider "${provider}" is not configured. Add ${provider.toUpperCase()}_API_KEY to your .env file.`
      );
    }
    switch (provider) {
      case "openrouter": return this.callOpenRouter(key, model, systemPrompt, messages, maxTokens);
      case "nvidia":     return this.callNvidia(key, model, systemPrompt, messages, maxTokens);
      case "anthropic":  return this.callAnthropic(key, model, systemPrompt, messages, maxTokens);
      case "gemini":     return this.callGemini(key, model, systemPrompt, messages, maxTokens);
      case "groq":       return this.callGroq(key, model, systemPrompt, messages, maxTokens);
    }
  }

  private async callAnthropic(key: string, model: string, system: string, messages: AiMessageParam[], maxTokens: number) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) {
      this.logger.warn(`Anthropic ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      throw new ForbiddenException("Anthropic API request failed.");
    }
    const json = await res.json() as any;
    return {
      reply: json.content?.find((c: any) => c.type === "text")?.text ?? "No response.",
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    };
  }

  private async callGemini(key: string, model: string, system: string, messages: AiMessageParam[], maxTokens: number) {
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      }
    );
    if (!res.ok) {
      this.logger.warn(`Gemini ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      throw new ForbiddenException("Gemini API request failed.");
    }
    const json = await res.json() as any;
    const usage = json.usageMetadata ?? {};
    return {
      reply: json.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response.",
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
    };
  }

  private async callGroq(key: string, model: string, system: string, messages: AiMessageParam[], maxTokens: number) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model, max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) {
      this.logger.warn(`Groq ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      throw new ForbiddenException("Groq API request failed.");
    }
    const json = await res.json() as any;
    return {
      reply: json.choices?.[0]?.message?.content ?? "No response.",
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }

  // ── OpenRouter (OpenAI-compatible, routes to hundreds of models) ────────────

  private async callOpenRouter(key: string, model: string, system: string, messages: AiMessageParam[], maxTokens: number) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Authorization": `Bearer ${key}`,
        "HTTP-Referer": "https://jokas.app",
        "X-Title": "Jokas ERP",
      },
      body: JSON.stringify({
        model, max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) {
      this.logger.warn(`OpenRouter ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      throw new ForbiddenException("OpenRouter API request failed.");
    }
    const json = await res.json() as any;
    return {
      reply: json.choices?.[0]?.message?.content ?? "No response.",
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }

  // ── NVIDIA NIM (OpenAI-compatible) ──────────────────────────────────────────

  private async callNvidia(key: string, model: string, system: string, messages: AiMessageParam[], maxTokens: number) {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model, max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) {
      this.logger.warn(`NVIDIA NIM ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      throw new ForbiddenException("NVIDIA NIM API request failed.");
    }
    const json = await res.json() as any;
    return {
      reply: json.choices?.[0]?.message?.content ?? "No response.",
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }

  // ── Chat ─────────────────────────────────────────────────────────────────────

  async chat(user: AuthenticatedUser, dto: AiChatDto, ipAddress?: string, userAgent?: string) {
    if (!user.permissions.includes("ai.read")) throw new ForbiddenException("AI access denied.");
    const model = this.resolveModel(dto.model);

    let session = dto.sessionId
      ? await this.prisma.aiChatSession.findFirst({ where: { id: dto.sessionId, userId: user.id } })
      : null;
    if (!session) {
      session = await this.prisma.aiChatSession.create({
        data: { companyId: user.companyId, userId: user.id, title: dto.message.slice(0, 80) },
      });
    }

    const history = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY,
    });
    history.reverse();

    const dataContext = await this.data.buildContext(user);
    await this.prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "user", content: dto.message } });

    const messages: AiMessageParam[] = [
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: dto.message },
    ];

    const system = `${BASE_PROMPT}\n\n--- LIVE COMPANY DATA (${new Date().toISOString().slice(0, 10)}) ---\n${dataContext}\n--- END DATA ---`;
    const { reply, inputTokens, outputTokens } = await this.callAi(model, system, messages, 1024, user.id);

    await this.prisma.aiChatMessage.create({ data: { sessionId: session.id, role: "assistant", content: reply } });

    await this.audit.write({
      companyId: user.companyId, actorUserId: user.id,
      action: "CREATE", entityType: "AiChatMessage", entityId: session.id,
      summary: `AI query: ${dto.message.slice(0, 120)}`,
      metadata: { sessionId: session.id, model, provider: this.detectProvider(model), inputTokens, outputTokens },
      ipAddress, userAgent,
    });

    return {
      data: {
        sessionId: session.id, model,
        reply,
        disclaimer: "AI insights are advisory only. Validate with your operational teams before acting.",
      },
    };
  }

  // ── Feed cost & ratio analysis ────────────────────────────────────────────────

  async feedAnalysis(user: AuthenticatedUser, batchId: string) {
    if (!user.permissions.includes("ai.read")) throw new ForbiddenException("AI access denied.");
    const model = this.defaultModel();
    const since7 = new Date(Date.now() - 7 * 86400000);

    const batch = await this.prisma.flockBatch.findFirst({
      where: { id: batchId, companyId: user.companyId },
      include: { farm: { select: { name: true } } },
    });
    if (!batch) throw new BadRequestException("Flock batch not found.");

    const feedRecords = await this.prisma.feedConsumptionRecord.findMany({
      where: { flockBatchId: batchId, companyId: user.companyId, recordDate: { gte: since7 } },
      orderBy: { recordDate: "asc" },
      select: { recordDate: true, quantityKg: true, costAmount: true },
    });

    const birds = Number((batch as any).currentBirdCount ?? (batch as any).openingBirdCount ?? 0);
    const totalKg   = feedRecords.reduce((s, r) => s + Number(r.quantityKg), 0);
    const totalCost = feedRecords.reduce((s, r) => s + Number((r as any).costAmount ?? 0), 0);
    const days = feedRecords.length || 1;

    const context = [
      `Batch: ${(batch as any).name ?? (batch as any).code} | Farm: ${batch.farm.name} | Type: ${(batch as any).birdType ?? "unknown"}`,
      `Birds: ${birds} | Age: ${(batch as any).ageWeeks ?? "unknown"} weeks`,
      `Last ${days} days of feed:`,
      ...feedRecords.map((r) => `  ${String(r.recordDate).slice(0, 10)}: ${r.quantityKg}kg${(r as any).costAmount ? ` @ GHS ${(r as any).costAmount}` : ""}`),
      `Totals: ${totalKg.toFixed(2)}kg, GHS ${totalCost.toFixed(2)}`,
      birds > 0 ? `Per-bird: ${((totalKg / days / birds) * 1000).toFixed(0)}g/bird/day, GHS ${(totalCost / days / birds).toFixed(4)}/bird/day` : "",
      totalKg > 0 && totalCost > 0 ? `Cost/kg: GHS ${(totalCost / totalKg).toFixed(2)}` : "",
    ].filter(Boolean).join("\n");

    const { reply } = await this.callAi(model, FEED_ANALYSIS_PROMPT, [{ role: "user", content: context }], 512, user.id);
    return { data: { batchId, model, analysis: reply } };
  }

  // ── Anomaly detection ─────────────────────────────────────────────────────────

  async anomalyCheck(user: AuthenticatedUser) {
    if (!user.permissions.includes("ai.read")) throw new ForbiddenException("AI access denied.");
    const model = this.defaultModel();
    const dataContext = await this.data.buildContext(user);
    const { reply } = await this.callAi(
      model, ANOMALY_PROMPT,
      [{ role: "user", content: `Analyse the following farm data for anomalies:\n\n${dataContext}` }],
      768, user.id
    );
    return { data: { model, anomalies: reply, checkedAt: new Date().toISOString() } };
  }

  // ── Report summary ────────────────────────────────────────────────────────────

  async reportSummary(user: AuthenticatedUser) {
    if (!user.permissions.includes("ai.read")) throw new ForbiddenException("AI access denied.");
    const model = this.defaultModel();
    const dataContext = await this.data.buildContext(user);
    const { reply } = await this.callAi(
      model, REPORT_SUMMARY_PROMPT,
      [{ role: "user", content: `Generate a farm performance summary:\n\n${dataContext}` }],
      512, user.id
    );
    return { data: { model, summary: reply, generatedAt: new Date().toISOString() } };
  }

  // ── Available models ──────────────────────────────────────────────────────────

  async models(user: AuthenticatedUser) {
    if (!user.permissions.includes("ai.read")) throw new ForbiddenException("AI access denied.");
    const defaultModel = this.defaultModel();
    const available = this.configuredModels().filter((id) => !!this.keyFor(this.detectProvider(id)));
    return {
      data: available.map((id) => ({
        id,
        provider: this.detectProvider(id),
        label: id.replace(/^claude-/, "Claude ").replace(/^gemini-/, "Gemini ").replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        isDefault: id === defaultModel,
      })),
    };
  }

  // ── Sessions ──────────────────────────────────────────────────────────────────

  async sessions(user: AuthenticatedUser) {
    if (!user.permissions.includes("ai.read")) throw new ForbiddenException("AI access denied.");
    const sessions = await this.prisma.aiChatSession.findMany({
      where: { companyId: user.companyId, userId: user.id },
      select: { id: true, title: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return { data: sessions };
  }

  async sessionMessages(user: AuthenticatedUser, sessionId: string) {
    if (!user.permissions.includes("ai.read")) throw new ForbiddenException("AI access denied.");
    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId: user.id, companyId: user.companyId },
    });
    if (!session) throw new ForbiddenException("Session not found.");
    const messages = await this.prisma.aiChatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
    return { data: { session, messages } };
  }

  async deleteSession(user: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId: user.id, companyId: user.companyId },
    });
    if (!session) throw new ForbiddenException("Session not found.");
    await this.prisma.aiChatSession.delete({ where: { id: sessionId } });
    return { data: { success: true } };
  }
}
