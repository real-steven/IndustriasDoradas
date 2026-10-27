import { Module } from "@nestjs/common";

import { INVENTORY_REPOSITORY } from "./inventory.contracts";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { SupabaseInventoryRepository } from "./supabase-inventory.repository";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    { provide: INVENTORY_REPOSITORY, useClass: SupabaseInventoryRepository },
  ],
})
export class InventoryModule {}
