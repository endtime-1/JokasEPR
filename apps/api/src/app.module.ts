import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { DutyRemindersModule } from "./modules/duty-reminders/duty-reminders.module";
import { validateEnvironment } from "./config/env.validation";
import { AiModule } from "./modules/ai/ai.module";
import { AlertsModule } from "./modules/alerts/alerts.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { FeedProductionModule } from "./modules/feed-production/feed-production.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { HRModule } from "./modules/hr/hr.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { QualityModule } from "./modules/quality/quality.module";
import { ProcurementModule } from "./modules/procurement/procurement.module";
import { QrModule } from "./modules/qr/qr.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { MarketPlanningModule } from "./modules/market-planning/market-planning.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { PoultryModule } from "./modules/poultry/poultry.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SalesModule } from "./modules/sales/sales.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { SoyaProcessingModule } from "./modules/soya-processing/soya-processing.module";
import { SyncModule } from "./modules/sync/sync.module";
import { QuickBooksModule } from "./modules/quickbooks/quickbooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    DutyRemindersModule,
    AuditModule,
    AuthModule,
    AiModule,
    AlertsModule,
    DashboardModule,
    PlatformModule,
    PoultryModule,
    FeedProductionModule,
    SoyaProcessingModule,
    InventoryModule,
    SalesModule,
    FinanceModule,
    ProcurementModule,
    MarketPlanningModule,
    QrModule,
    MaintenanceModule,
    HRModule,
    QualityModule,
    IdentityModule,
    NotificationsModule,
    ReportsModule,
    SettingsModule,
    SyncModule,
    QuickBooksModule
  ]
})
export class AppModule {}
