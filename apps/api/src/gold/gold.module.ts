import { Module } from "@nestjs/common";

import { GOLD_REPOSITORY } from "./gold.contracts";
import { GoldController } from "./gold.controller";
import { GoldService } from "./gold.service";
import { SupabaseGoldRepository } from "./supabase-gold.repository";
import { AuditModule } from "../audit/audit.module";
import { ManagementModule } from "../management/management.module";

@Module({
  imports: [AuditModule, ManagementModule],
  controllers: [GoldController],
  providers: [
    GoldService,
    { provide: GOLD_REPOSITORY, useClass: SupabaseGoldRepository },
  ],
})
export class GoldModule {}
