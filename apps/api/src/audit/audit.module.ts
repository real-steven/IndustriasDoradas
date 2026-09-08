import { Global, Module } from "@nestjs/common";

import { AuditQueryController } from "./audit-query.controller";
import {
  AUDIT_EVENT_REPOSITORY,
  AUDIT_QUERY_REPOSITORY,
} from "./audit.contracts";
import { AuditTrailService } from "./audit-trail.service";
import { SupabaseAuditEventRepository } from "./supabase-audit-event.repository";
import { SupabaseAuditQueryRepository } from "./supabase-audit-query.repository";

@Global()
@Module({
  controllers: [AuditQueryController],
  providers: [
    AuditTrailService,
    {
      provide: AUDIT_EVENT_REPOSITORY,
      useClass: SupabaseAuditEventRepository,
    },
    { provide: AUDIT_QUERY_REPOSITORY, useClass: SupabaseAuditQueryRepository },
  ],
  exports: [AuditTrailService, AUDIT_EVENT_REPOSITORY, AUDIT_QUERY_REPOSITORY],
})
export class AuditModule {}
