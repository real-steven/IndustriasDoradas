import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";

import {
  CreateLineComponentDto,
  CreatePlantDto,
  CreateProductionLineDto,
  CreateStationDto,
  CreateSupplierDto,
  SetCatalogStateDto,
  UpdateLineComponentDto,
  UpdatePlantDto,
  UpdateProductionLineDto,
  UpdateStationDto,
  UpdateSupplierDto,
} from "./catalogs.dto";
import { CatalogsService } from "./catalogs.service";
import {
  RequireOrganizationParam,
  RequirePermissions,
} from "../auth/auth.metadata";
import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PageQueryDto } from "../common/dto/page-query.dto";

@Controller({ path: "organizations/:organizationId", version: "1" })
@RequireOrganizationParam()
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get("component-types")
  @RequirePermissions("organization_catalogs.read")
  listComponentTypes() {
    return this.catalogs.listComponentTypes();
  }

  @Get("plants")
  @RequirePermissions("organization_catalogs.read")
  listPlants(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.catalogs.list("plants", organizationId, query);
  }

  @Post("plants")
  @RequirePermissions("organization_catalogs.manage")
  createPlant(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: CreatePlantDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.create(
      "plants",
      { organizationId, ...body },
      this.context(request),
    );
  }

  @Patch("plants/:id")
  @RequirePermissions("organization_catalogs.manage")
  updatePlant(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdatePlantDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.update(
      "plants",
      organizationId,
      id,
      body,
      this.context(request),
    );
  }

  @Patch("plants/:id/state")
  @RequirePermissions("organization_catalogs.manage")
  setPlantState(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetCatalogStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.setActive(
      "plants",
      organizationId,
      id,
      body.active,
      this.context(request),
    );
  }

  @Get("plants/:plantId/lines")
  @RequirePermissions("organization_catalogs.read")
  listLines(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.catalogs.list("production_lines", organizationId, {
      ...query,
      plantId,
    });
  }

  @Post("plants/:plantId/lines")
  @RequirePermissions("organization_catalogs.manage")
  createLine(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Body() body: CreateProductionLineDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.create(
      "production_lines",
      { organizationId, plantId, ...body },
      this.context(request),
    );
  }

  @Patch("lines/:id")
  @RequirePermissions("organization_catalogs.manage")
  updateLine(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateProductionLineDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.update(
      "production_lines",
      organizationId,
      id,
      body,
      this.context(request),
    );
  }

  @Patch("lines/:id/state")
  @RequirePermissions("organization_catalogs.manage")
  setLineState(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetCatalogStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.setActive(
      "production_lines",
      organizationId,
      id,
      body.active,
      this.context(request),
    );
  }

  @Get("lines/:lineId/components")
  @RequirePermissions("organization_catalogs.read")
  listComponents(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("lineId", ParseUUIDPipe) productionLineId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.catalogs.list("line_components", organizationId, {
      ...query,
      productionLineId,
    });
  }

  @Post("lines/:lineId/components")
  @RequirePermissions("organization_catalogs.manage")
  createComponent(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("lineId", ParseUUIDPipe) productionLineId: string,
    @Body() body: CreateLineComponentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.create(
      "line_components",
      { organizationId, productionLineId, ...body },
      this.context(request),
    );
  }

  @Patch("components/:id")
  @RequirePermissions("organization_catalogs.manage")
  updateComponent(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateLineComponentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.update(
      "line_components",
      organizationId,
      id,
      body,
      this.context(request),
    );
  }

  @Patch("components/:id/state")
  @RequirePermissions("organization_catalogs.manage")
  setComponentState(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetCatalogStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.setActive(
      "line_components",
      organizationId,
      id,
      body.active,
      this.context(request),
    );
  }

  @Get("plants/:plantId/stations")
  @RequirePermissions("organization_catalogs.read")
  listStations(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.catalogs.list("stations", organizationId, {
      ...query,
      plantId,
    });
  }

  @Post("plants/:plantId/stations")
  @RequirePermissions("stations.manage")
  createStation(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Body() body: CreateStationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.create(
      "stations",
      { organizationId, plantId, ...body },
      this.context(request),
    );
  }

  @Patch("stations/:id")
  @RequirePermissions("stations.manage")
  updateStation(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateStationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.update(
      "stations",
      organizationId,
      id,
      body,
      this.context(request),
    );
  }

  @Patch("stations/:id/state")
  @RequirePermissions("stations.manage")
  setStationState(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetCatalogStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.setActive(
      "stations",
      organizationId,
      id,
      body.active,
      this.context(request),
    );
  }

  @Get("suppliers")
  @RequirePermissions("organization_catalogs.read")
  listSuppliers(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.catalogs.list("suppliers", organizationId, query);
  }

  @Post("suppliers")
  @RequirePermissions("suppliers.manage")
  createSupplier(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: CreateSupplierDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.create(
      "suppliers",
      { organizationId, ...body },
      this.context(request),
    );
  }

  @Patch("suppliers/:id")
  @RequirePermissions("suppliers.manage")
  updateSupplier(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateSupplierDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.update(
      "suppliers",
      organizationId,
      id,
      body,
      this.context(request),
    );
  }

  @Patch("suppliers/:id/state")
  @RequirePermissions("suppliers.manage")
  setSupplierState(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetCatalogStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.catalogs.setActive(
      "suppliers",
      organizationId,
      id,
      body.active,
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
