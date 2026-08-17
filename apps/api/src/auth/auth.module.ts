import { Module } from "@nestjs/common";

import { ACCESS_TOKEN_VERIFIER, PROFILE_REPOSITORY } from "./auth.contracts";
import { AuthController } from "./auth.controller";
import { SupabaseJwtVerifier } from "./supabase-jwt-verifier";
import { SupabaseProfileRepository } from "./supabase-profile.repository";

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: ACCESS_TOKEN_VERIFIER,
      useClass: SupabaseJwtVerifier,
    },
    {
      provide: PROFILE_REPOSITORY,
      useClass: SupabaseProfileRepository,
    },
  ],
  exports: [ACCESS_TOKEN_VERIFIER, PROFILE_REPOSITORY],
})
export class AuthModule {}
