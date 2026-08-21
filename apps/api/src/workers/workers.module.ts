import { Module } from "@nestjs/common";

import { SupabaseWorkersRepository } from "./supabase-workers.repository";
import { WorkersController } from "./workers.controller";
import { WORKERS_REPOSITORY } from "./workers.contracts";
import { WorkersService } from "./workers.service";

@Module({
  controllers: [WorkersController],
  providers: [
    WorkersService,
    { provide: WORKERS_REPOSITORY, useClass: SupabaseWorkersRepository },
  ],
  exports: [WorkersService, WORKERS_REPOSITORY],
})
export class WorkersModule {}
