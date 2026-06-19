import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/modules/prisma/prisma.service";
import { HttpExceptionFilter } from "../../src/common/filters/http-exception.filter";
import { createPrismaMock, PrismaMock } from "./prisma.mock";

export type TestApp = {
  app: INestApplication;
  prisma: PrismaMock;
};

export async function createTestApp(): Promise<TestApp> {
  const prismaMock = createPrismaMock();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .setLogger({ log: () => {}, error: () => {}, warn: () => {}, debug: () => {}, verbose: () => {} })
    .compile();

  const app = moduleRef.createNestApplication();

  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();

  return { app, prisma: prismaMock };
}
