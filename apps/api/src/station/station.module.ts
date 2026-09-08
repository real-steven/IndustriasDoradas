import { Module } from "@nestjs/common";

import { PinVerifierService } from "./pin-verifier.service";
import { PinController, StationController } from "./station.controller";
import { STATION_REPOSITORY } from "./station.contracts";
import { StationService } from "./station.service";
import { SupabaseStationRepository } from "./supabase-station.repository";

@Module({
  controllers: [StationController, PinController],
  providers: [
    StationService,
    PinVerifierService,
    { provide: STATION_REPOSITORY, useClass: SupabaseStationRepository },
  ],
  exports: [StationService, STATION_REPOSITORY],
})
export class StationModule {}
