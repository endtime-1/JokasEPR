import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuditModule } from "../audit/audit.module";
import { AiController } from "./ai.controller";
import { AiDataService } from "./ai-data.service";
import { AiService } from "./ai.service";

@Module({
  imports: [ConfigModule, AuditModule],
  controllers: [AiController],
  providers: [AiService, AiDataService]
})
export class AiModule {}
