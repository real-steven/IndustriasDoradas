import { Module } from "@nestjs/common";

import {
  ProfileController,
  StationProfileController,
} from "./profile.controller";
import { SELF_PROFILE_REPOSITORY } from "./profile.contracts";
import { ProfileService } from "./profile.service";
import { SupabaseSelfProfileRepository } from "./supabase-self-profile.repository";
import { StationModule } from "../station/station.module";

@Module({
  imports: [StationModule],
  controllers: [ProfileController, StationProfileController],
  providers: [
    ProfileService,
    {
      provide: SELF_PROFILE_REPOSITORY,
      useClass: SupabaseSelfProfileRepository,
    },
  ],
})
export class ProfileModule {}
