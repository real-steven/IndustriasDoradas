import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";

import { SyncPushDto } from "./sync.dto";
import { SyncService } from "./sync.service";
import { RequireOrganizationParam, RequireRoles } from "../auth/auth.metadata";
import type { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller({
  path: "organizations/:organizationId/stations/:stationId/sync",
  version: "1",
})
@RequireOrganizationParam()
@RequireRoles("JEFE_PLANTA")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post("push")
  @HttpCode(HttpStatus.OK)
  push(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("stationId", ParseUUIDPipe) stationId: string,
    @Body() body: SyncPushDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (request.auth === undefined || request.correlationId === undefined) {
      throw new Error("Authenticated request context is missing");
    }
    return this.sync.push(
      organizationId,
      stationId,
      body,
      request.auth,
      request.correlationId,
    );
  }
}
