import { Module } from "@nestjs/common";

import { SYNC_REPOSITORY } from "./sync.contracts";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";
import { SupabaseSyncRepository } from "./supabase-sync.repository";

@Module({
  controllers: [SyncController],
  providers: [
    SyncService,
    { provide: SYNC_REPOSITORY, useClass: SupabaseSyncRepository },
  ],
})
export class SyncModule {}
