import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { mkdirSync } from "fs";
import { join } from "path";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { RequestLoggingInterceptor } from "./common/interceptors/request-logging.interceptor";

async function bootstrap() {
  process.stderr.write("[api] bootstrap() starting\n");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const port = config.get<number>("API_PORT", 4001);
  const prefix = config.get<string>("API_PREFIX", "api");
  const version = config.get<string>("API_VERSION", "1");
  const isProduction = config.get("NODE_ENV") === "production";

  // Health check — bypasses prefix/versioning so UptimeRobot can ping /health
  // to keep Render free-tier from suspending the service.
  app.use("/health", (_req: unknown, res: { send: (s: string) => void }) => res.send("ok"));

  app.setGlobalPrefix(prefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: version });

  app.use(cookieParser());

  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameSrc: ["'none'"],
              upgradeInsecureRequests: []
            }
          }
        : false,
      hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
      crossOriginEmbedderPolicy: false
    })
  );

  const allowedOrigins = config
    .get<string>("WEB_ORIGIN", "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization"]
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  const uploadsDir = join(process.cwd(), "uploads");
  mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: "/uploads" });

  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/${prefix}/v${version}`, "Bootstrap");
}

bootstrap().catch((err) => {
  process.stderr.write("[api] FATAL: " + (err?.stack || err) + "\n");
  process.exit(1);
});
