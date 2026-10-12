import { Module } from "@nestjs/common";

import { ManagementController } from "./management.controller";
import { MANAGEMENT_QUERY_REPOSITORY } from "./management.contracts";
import { ManagementService } from "./management.service";
import { SupabaseManagementQueryRepository } from "./supabase-management-query.repository";

@Module({
  controllers: [ManagementController],
  providers: [
    ManagementService,
    {
      provide: MANAGEMENT_QUERY_REPOSITORY,
      useClass: SupabaseManagementQueryRepository,
    },
  ],
  exports: [ManagementService, MANAGEMENT_QUERY_REPOSITORY],
})
export class ManagementModule {}
