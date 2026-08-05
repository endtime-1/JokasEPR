import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { NoCacheInterceptor } from "./common/interceptors/no-cache.interceptor";
import { RequestLoggingInterceptor } from "./common/interceptors/request-logging.interceptor";
import { PrismaService } from "./modules/prisma/prisma.service";

async function bootstrap() {
  process.stderr.write("[api] bootstrap() starting\n");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const prisma = app.get(PrismaService);
  const port = config.get<number>("API_PORT", 4001);
  const prefix = config.get<string>("API_PREFIX", "api");
  const version = config.get<string>("API_VERSION", "1");
  const isProduction = config.get("NODE_ENV") === "production";

  // Health check — runs a lightweight DB query so that periodic pings from start.js
  // keep the MySQL connection pool alive (prevents first-query stall after idle).
  // Returns 503 when the DB is unavailable so load balancers can act on it.
  app.use("/health", async (_req: unknown, res: { status: (c: number) => { send: (s: string) => void }; send: (s: string) => void }) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.send("ok");
    } catch {
      res.status(503).send("db_unavailable");
    }
  });

  app.setGlobalPrefix(prefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: version });

  // Trust LiteSpeed's X-Forwarded-For header so request.ip reflects the real
  // client IP, not the loopback address of the reverse proxy. Without this,
  // the login rate limiter keys on 127.0.0.1 for every user.
  app.set("trust proxy", 1);

  // Assign a unique request ID early so the HttpExceptionFilter can include it
  // in error responses — enables matching a client-reported error to a server log.
  app.use((req: { id?: string }, _res: unknown, next: () => void) => {
    req.id = randomUUID();
    next();
  });

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
    allowedHeaders: ["content-type", "authorization", "x-client-type"]
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new NoCacheInterceptor(), new RequestLoggingInterceptor());

  // Ensure uploads directory exists. Files are served via the authenticated
  // UploadsController — not as public static assets.
  mkdirSync(join(process.cwd(), "uploads"), { recursive: true });

  // Swagger API docs — only enabled outside production so the spec is never
  // publicly exposed on the live server. Set ENABLE_SWAGGER=true in dev or staging.
  if (!isProduction || process.env.ENABLE_SWAGGER === "true") {
    const spec = new DocumentBuilder()
      .setTitle("Jokas Agribusiness ERP")
      .setDescription("REST API for poultry, HR, finance, inventory, and operations")
      .setVersion(version)
      .addCookieAuth("jokas_at")
      .build();
    const document = SwaggerModule.createDocument(app, spec);
    SwaggerModule.setup(`${prefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    Logger.log(`Swagger docs at http://localhost:${port}/${prefix}/docs`, "Bootstrap");
  }

  // Graceful shutdown: deploy.yml sends SIGTERM (via `pkill`) to restart the API
  // on every deploy. Without a handler, Node's default SIGTERM action kills the
  // process immediately, cutting off in-flight requests and any open Prisma
  // transaction mid-write. app.close() stops accepting new connections, lets
  // in-flight ones finish, and closes the Prisma pool cleanly (PrismaService's
  // onModuleDestroy) before the process exits.
  app.enableShutdownHooks();
  let shuttingDown = false;
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      Logger.log(`${sig} received — draining in-flight requests and shutting down`, "Bootstrap");
      const forceExit = setTimeout(() => {
        Logger.warn("Graceful shutdown timed out after 10s — forcing exit", "Bootstrap");
        process.exit(1);
      }, 10_000);
      forceExit.unref();
      app
        .close()
        .then(() => process.exit(0))
        .catch((err) => {
          Logger.error(`Error during shutdown: ${err?.message || err}`, "Bootstrap");
          process.exit(1);
        });
    });
  }

  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/${prefix}/v${version}`, "Bootstrap");
}

// Prevent a stray unhandled promise rejection from crashing the NestJS process.
// NestJS catches request-level errors via HttpExceptionFilter, but cron jobs or
// background promises that throw without a try-catch reach here first.
// Log and continue — the API stays up; the scheduler job is simply skipped.
process.on("uncaughtException", (err) => {
  process.stderr.write("[api] uncaughtException: " + (err?.stack || err) + "\n");
});
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.stack : String(reason);
  process.stderr.write("[api] unhandledRejection: " + msg + "\n");
});

bootstrap().catch((err) => {
  process.stderr.write("[api] FATAL: " + (err?.stack || err) + "\n");
  process.exit(1);
});
