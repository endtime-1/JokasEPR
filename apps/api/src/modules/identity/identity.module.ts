import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [IdentityController],
  providers: [IdentityService]
})
export class IdentityModule {}

