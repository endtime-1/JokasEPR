type AppEnvironment = {
  NODE_ENV: "development" | "test" | "production";
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL_DAYS: string;
  API_PORT: string;
  API_PREFIX: string;
  API_VERSION: string;
  WEB_ORIGIN: string;
  UPLOAD_MAX_MB: string;
  AI_API_KEY?: string;        // legacy single-key fallback
  OPENROUTER_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  AI_MODEL?: string;
  AI_MODELS?: string;
  // Email (Nodemailer SMTP)
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM_ADDRESS?: string;
  SMTP_FROM_NAME?: string;
  // SMS (Twilio)
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  // WhatsApp (Twilio WhatsApp or Meta Cloud API)
  WHATSAPP_API_URL?: string;
  WHATSAPP_API_TOKEN?: string;
  WHATSAPP_FROM_NUMBER?: string;
  // QuickBooks Online Integration
  QB_CLIENT_ID?: string;
  QB_CLIENT_SECRET?: string;
  QB_REDIRECT_URI?: string;
  QB_ENVIRONMENT?: string;
  QB_TOKEN_ENCRYPTION_KEY?: string;
  QB_WEBHOOK_VERIFIER_TOKEN?: string;
};

const defaults: Partial<AppEnvironment> = {
  NODE_ENV: "development",
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL_DAYS: "30",
  API_PORT: "4001",
  API_PREFIX: "api",
  API_VERSION: "1",
  WEB_ORIGIN: "http://localhost:3000",
  UPLOAD_MAX_MB: "10",
  AI_MODEL: "deepseek/deepseek-chat"
};

export function validateEnvironment(config: Record<string, unknown>): AppEnvironment {
  const env = { ...defaults, ...config } as AppEnvironment;
  const missing = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"].filter((key) => !env[key as keyof AppEnvironment]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }

  if (!["development", "test", "production"].includes(env.NODE_ENV)) {
    throw new Error("NODE_ENV must be one of development, test, or production.");
  }

  if (env.JWT_ACCESS_SECRET.length < 32 || env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error("JWT secrets must be at least 32 characters.");
  }

  if (Number.isNaN(Number(env.API_PORT)) || Number(env.API_PORT) <= 0) {
    throw new Error("API_PORT must be a positive number.");
  }

  if (Number.isNaN(Number(env.JWT_REFRESH_TTL_DAYS)) || Number(env.JWT_REFRESH_TTL_DAYS) <= 0) {
    throw new Error("JWT_REFRESH_TTL_DAYS must be a positive number.");
  }

  return env;
}

