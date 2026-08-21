import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";

import {
  AUDIT_QUERY_REPOSITORY,
  type AuditQueryRepository,
} from "./audit.contracts";
import { AuditQueryDto } from "./audit-query.dto";
import {
  RequireOrganizationParam,
  RequirePermissions,
} from "../auth/auth.metadata";
import { Inject } from "@nestjs/common";

@Controller({
  path: "organizations/:organizationId/audit-events",
  version: "1",
})
@RequireOrganizationParam()
@RequirePermissions("audit.read_operational")
export class AuditQueryController {
  constructor(
    @Inject(AUDIT_QUERY_REPOSITORY)
    private readonly repository: AuditQueryRepository,
  ) {}

  @Get()
  list(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: AuditQueryDto,
  ) {
    return this.repository.list(organizationId, query);
  }
}
