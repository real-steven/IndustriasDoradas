import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import {
  GoldFiltersDto,
  RecordShipmentGoldDto,
  RecordSweepMercuryDto,
  ReviewShipmentGoldDto,
} from "./gold.dto";
import { GoldService } from "./gold.service";
import {
  RequireOrganizationParam,
  RequirePermissions,
  RequireRoles,
} from "../auth/auth.metadata";
import type { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller({
  path: "organizations/:organizationId/management",
  version: "1",
})
@RequireOrganizationParam()
@RequireRoles("JEFE_EMPRESA")
@ApiTags("Gold")
export class GoldController {
  constructor(private readonly gold: GoldService) {}

  @Get("gold-summary")
  @RequirePermissions("gold.read")
  summary(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: GoldFiltersDto,
  ) {
    return this.gold.summary(organizationId, query);
  }

  @Get("shipments/:shipmentId/gold-results")
  @RequirePermissions("gold.read")
  history(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("shipmentId", ParseUUIDPipe) shipmentId: string,
  ) {
    return this.gold.history(organizationId, shipmentId);
  }

  @Post("shipments/:shipmentId/gold-results")
  @RequirePermissions("gold.results.manage")
  record(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("shipmentId", ParseUUIDPipe) shipmentId: string,
    @Body() body: RecordShipmentGoldDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.gold.record(
      organizationId,
      shipmentId,
      body,
      this.context(request),
    );
  }

  @Get("shipments/:shipmentId/gold-reviews")
  @RequirePermissions("gold.read")
  reviewHistory(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("shipmentId", ParseUUIDPipe) shipmentId: string,
  ) {
    return this.gold.reviewHistory(organizationId, shipmentId);
  }

  @Post("shipments/:shipmentId/gold-reviews")
  @RequirePermissions("gold.results.manage")
  review(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("shipmentId", ParseUUIDPipe) shipmentId: string,
    @Body() body: ReviewShipmentGoldDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.gold.review(
      organizationId,
      shipmentId,
      body,
      this.context(request),
    );
  }

  @Post("shipments/:shipmentId/sweeps/:sweepId/mercury")
  @RequirePermissions("gold.results.manage")
  recordMercury(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("shipmentId", ParseUUIDPipe) shipmentId: string,
    @Param("sweepId", ParseUUIDPipe) sweepId: string,
    @Body() body: RecordSweepMercuryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.gold.recordMercury(
      organizationId,
      shipmentId,
      sweepId,
      body,
      this.context(request),
    );
  }

  private context(request: AuthenticatedRequest) {
    if (request.auth === undefined || request.correlationId === undefined) {
      throw new Error("Authenticated request context is missing");
    }
    return { auth: request.auth, correlationId: request.correlationId };
  }
}
