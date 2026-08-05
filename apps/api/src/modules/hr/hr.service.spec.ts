import { Test, TestingModule } from "@nestjs/testing";
import { HRService } from "./hr.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../notifications/email.service";
import { NotificationsService } from "../notifications/notifications.service";

describe("HRService", () => {
  let service: HRService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HRService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: { write: jest.fn() } },
        { provide: EmailService, useValue: { sendWithAttachment: jest.fn() } },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    service = module.get<HRService>(HRService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
