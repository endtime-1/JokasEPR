import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { QuickBooksController } from "./quickbooks.controller";
import { QuickBooksTokenService } from "./services/quickbooks-token.service";
import { QuickBooksOAuthService } from "./services/quickbooks-oauth.service";
import { QuickBooksClientService } from "./services/quickbooks-client.service";
import { QuickBooksLoggerService } from "./services/quickbooks-logger.service";
import { QuickBooksMappingService } from "./services/quickbooks-mapping.service";
import { QuickBooksCustomerService } from "./services/quickbooks-customer.service";
import { QuickBooksVendorService } from "./services/quickbooks-vendor.service";
import { QuickBooksItemService } from "./services/quickbooks-item.service";
import { QuickBooksInvoiceService } from "./services/quickbooks-invoice.service";
import { QuickBooksPaymentService } from "./services/quickbooks-payment.service";
import { QuickBooksBillService } from "./services/quickbooks-bill.service";
import { QuickBooksExpenseService } from "./services/quickbooks-expense.service";
import { QuickBooksSyncService } from "./services/quickbooks-sync.service";
import { QuickBooksWebhookService } from "./services/quickbooks-webhook.service";
import { QuickBooksSchedulerService } from "./services/quickbooks-scheduler.service";

@Module({
  imports: [PrismaModule],
  controllers: [QuickBooksController],
  providers: [
    QuickBooksTokenService,
    QuickBooksOAuthService,
    QuickBooksClientService,
    QuickBooksLoggerService,
    QuickBooksMappingService,
    QuickBooksCustomerService,
    QuickBooksVendorService,
    QuickBooksItemService,
    QuickBooksInvoiceService,
    QuickBooksPaymentService,
    QuickBooksBillService,
    QuickBooksExpenseService,
    QuickBooksSyncService,
    QuickBooksWebhookService,
    QuickBooksSchedulerService
  ],
  exports: [QuickBooksSyncService, QuickBooksLoggerService]
})
export class QuickBooksModule {}
