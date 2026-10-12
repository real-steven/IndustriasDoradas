import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { ManagementPageQueryDto, ManagementQueryDto } from "./management.dto";
import { ManagementService } from "./management.service";
import { RequireOrganizationParam, RequireRoles } from "../auth/auth.metadata";

@Controller({
  path: "organizations/:organizationId/management",
  version: "1",
})
@RequireOrganizationParam()
@RequireRoles("JEFE_EMPRESA")
@ApiTags("Management")
export class ManagementController {
  constructor(private readonly management: ManagementService) {}

  @Get("operation-lines")
  listOperationLines(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ManagementQueryDto,
  ) {
    return this.management.listOperationLines(organizationId, query);
  }

  @Get("shipments")
  listShipments(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: ManagementQueryDto,
  ) {
    return this.management.listShipments(organizationId, query);
  }

  @Get("shipments/:shipmentId")
  findShipment(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("shipmentId", ParseUUIDPipe) shipmentId: string,
  ) {
    return this.management.findShipment(organizationId, shipmentId);
  }

  @Get("shipments/:shipmentId/sweeps")
  listShipmentSweeps(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("shipmentId", ParseUUIDPipe) shipmentId: string,
    @Query() query: ManagementPageQueryDto,
  ) {
    return this.management.listShipmentSweeps(
      organizationId,
      shipmentId,
      query,
    );
  }
}
