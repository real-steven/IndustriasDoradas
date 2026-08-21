import { Module } from "@nestjs/common";

import {
  AccountsController,
  ProfilePreferencesController,
} from "./accounts.controller";
import { ACCOUNTS_REPOSITORY } from "./accounts.contracts";
import { AccountsService } from "./accounts.service";
import { SupabaseAccountsRepository } from "./supabase-accounts.repository";

@Module({
  controllers: [AccountsController, ProfilePreferencesController],
  providers: [
    AccountsService,
    { provide: ACCOUNTS_REPOSITORY, useClass: SupabaseAccountsRepository },
  ],
  exports: [AccountsService, ACCOUNTS_REPOSITORY],
})
export class AccountsModule {}
