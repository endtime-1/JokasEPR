import { Module } from "@nestjs/common";
import { HRModule } from "../hr/hr.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PoultryModule } from "../poultry/poultry.module";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [PoultryModule, InventoryModule, HRModule],
  controllers: [SyncController],
  providers: [SyncService]
})
export class SyncModule {}
