import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";

import { PinDto } from "./station.dto";
import { StationService } from "./station.service";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { RequireOrganizationParam, RequireRoles } from "../auth/auth.metadata";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import type { AuthenticatedContext } from "../auth/auth.contracts";

@Controller({
  path: "organizations/:organizationId/stations/:stationId",
  version: "1",
})
@RequireOrganizationParam()
@RequireRoles("JEFE_PLANTA")
export class StationController {
  constructor(private readonly station: StationService) {}

  @Get("session-snapshot")
  snapshot(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("stationId", ParseUUIDPipe) stationId: string,
    @CurrentAuth() auth: AuthenticatedContext,
  ) {
    return this.station.snapshot(organizationId, stationId, auth);
  }

  @Post("elevations")
  elevate(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("stationId", ParseUUIDPipe) stationId: string,
    @Body() body: PinDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (request.auth === undefined || request.correlationId === undefined)
      throw new Error("Authenticated request context is missing");
    return this.station.elevate(
      organizationId,
      stationId,
      body.pin,
      request.auth,
      request.correlationId,
    );
  }
}

@Controller({ path: "profile/pin", version: "1" })
@RequireRoles("JEFE_PLANTA")
export class PinController {
  constructor(private readonly station: StationService) {}
  @Post()
  set(@Body() body: PinDto, @CurrentAuth() auth: AuthenticatedContext) {
    return this.station.setPin(body.pin, auth);
  }
  @Post("reset-blocks")
  reset(@CurrentAuth() auth: AuthenticatedContext) {
    return this.station.resetBlocks(auth);
  }
}
