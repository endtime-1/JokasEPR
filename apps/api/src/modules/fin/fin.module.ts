import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { FinAccountingController } from "./fin-accounting.controller";
import { FinAccountsService } from "./fin-accounts.service";
import { FinAuditService } from "./fin-audit.service";
import { FinBankPaymentsService } from "./fin-bank-payments.service";
import { FinBankingController } from "./fin-banking.controller";
import { FinOnlinePaymentsService, FinPaymentProviders } from "./fin-online-payments.service";
import { FinPaymentAccountsService } from "./fin-payment-accounts.service";
import { FinReconciliationService } from "./fin-reconciliation.service";
import { FinWebhooksController } from "./fin-webhooks.controller";
import { FinContactsController, FinTaxController } from "./fin-contacts.controller";
import { FinContactsService } from "./fin-contacts.service";
import { FinCreditNotesService } from "./fin-credit-notes.service";
import { FinCustomerPaymentsService } from "./fin-customer-payments.service";
import { FinPosController } from "./fin-pos.controller";
import { FinPosReceiptService } from "./fin-pos-receipt.service";
import { FinPosService } from "./fin-pos.service";
import { FinItemsController } from "./fin-items.controller";
import { FinItemsService } from "./fin-items.service";
import { FinStockService } from "./fin-stock.service";
import { FinIntegrationsController } from "./fin-integrations.controller";
import { FinIntegrationsScheduler } from "./fin-integrations.scheduler";
import { FinIntegrationsService } from "./fin-integrations.service";
import { PrismaSalesOrderSource, SALES_ORDER_SOURCE } from "./fin-integration-source";
import { FinInvoicesService } from "./fin-invoices.service";
import { FinLedgerService } from "./fin-ledger.service";
import { FinLinksService } from "./fin-links.service";
import { FinNumberingService } from "./fin-numbering.service";
import { FinPdfService } from "./fin-pdf.service";
import { FinPublicController } from "./fin-public.controller";
import { FinQuotesService } from "./fin-quotes.service";
import { FinRecurringService } from "./fin-recurring.service";
import { FinReminderService } from "./fin-reminders.service";
import { FinReportsService } from "./fin-reports.service";
import { FinSalesController } from "./fin-sales.controller";
import { FinSalesScheduler } from "./fin-sales.scheduler";
import { FinSalesShareService } from "./fin-sales-share.service";
import { FinSettingsController } from "./fin-settings.controller";
import { FinSettingsService } from "./fin-settings.service";
import { FinStatementService } from "./fin-statement.service";
import { FinTaxService } from "./fin-tax.service";

/**
 * Finance v2 ("fin"): a self-contained set of books. It owns its own fin_* tables, its own ledger,
 * its own audit log and its own settings, and does not read or write any other ERP module's data.
 * It borrows only plumbing: the email sender. Sales, purchases and payroll all post INTO the ledger
 * through FinLedgerService.post().
 */
@Module({
  imports: [NotificationsModule],
  controllers: [FinSettingsController, FinAccountingController, FinContactsController, FinTaxController, FinSalesController, FinPublicController, FinBankingController, FinWebhooksController, FinIntegrationsController, FinItemsController, FinPosController],
  providers: [
    FinAuditService, FinNumberingService, FinSettingsService, FinAccountsService, FinLedgerService, FinReportsService, FinContactsService, FinTaxService,
    FinInvoicesService, FinQuotesService, FinCustomerPaymentsService, FinCreditNotesService, FinRecurringService, FinStatementService,
    FinLinksService, FinPdfService, FinSalesShareService, FinReminderService, FinSalesScheduler,
    FinPaymentAccountsService, FinBankPaymentsService, FinPaymentProviders, FinOnlinePaymentsService, FinReconciliationService,
    FinIntegrationsService, FinIntegrationsScheduler, { provide: SALES_ORDER_SOURCE, useClass: PrismaSalesOrderSource },
    FinStockService, FinItemsService, FinPosService, FinPosReceiptService
  ],
  exports: [FinStockService, FinItemsService, FinLedgerService, FinNumberingService, FinAuditService, FinContactsService, FinTaxService, FinInvoicesService]
})
export class FinModule {}
