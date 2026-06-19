import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PoultryController } from "./poultry.controller";
import { PoultryService } from "./poultry.service";

@Module({
  imports: [AuditModule],
  controllers: [PoultryController],
  providers: [PoultryService],
  exports: [PoultryService]
})
export class PoultryModule {}
