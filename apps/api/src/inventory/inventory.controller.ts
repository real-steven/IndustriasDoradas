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
import { ApiTags } from "@nestjs/swagger";

import {
  CreateInventoryItemDto,
  CreateInventoryItemTypeDto,
  CreateInventoryUnitDto,
  InventoryCatalogQueryDto,
  InventoryComponentHistoryQueryDto,
  InventoryHistoryQueryDto,
  InventoryReviewHistoryQueryDto,
  RecordInventoryAdjustmentDto,
  RecordInventoryMovementDto,
  RecordInventoryReviewDto,
  RecordRastraComponentChangeDto,
  ReverseInventoryMovementDto,
  SetInventoryCatalogStateDto,
} from "./inventory.dto";
import { InventoryService } from "./inventory.service";
import {
  RequireOrganizationParam,
  RequirePermissions,
  RequireRoles,
} from "../auth/auth.metadata";
import type { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller({ path: "organizations/:organizationId/inventory", version: "1" })
@RequireOrganizationParam()
@RequireRoles("JEFE_PLANTA", "JEFE_EMPRESA")
@RequirePermissions("inventory.manage")
@ApiTags("Inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("item-types")
  listItemTypes(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: InventoryCatalogQueryDto,
  ) {
    return this.inventory.listCatalog("item-types", organizationId, query);
  }

  @Post("item-types")
  createItemType(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: CreateInventoryItemTypeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.createCatalog(
      "item-types",
      { organizationId, ...body },
      this.context(request),
    );
  }

  @Patch("item-types/:id/state")
  setItemTypeState(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetInventoryCatalogStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.setCatalogActive(
      "item-types",
      organizationId,
      id,
      body.active,
      this.context(request),
    );
  }

  @Get("units")
  listUnits(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Query() query: InventoryCatalogQueryDto,
  ) {
    return this.inventory.listCatalog("units", organizationId, query);
  }

  @Post("units")
  createUnit(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: CreateInventoryUnitDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.createCatalog(
      "units",
      { organizationId, ...body },
      this.context(request),
    );
  }

  @Patch("units/:id/state")
  setUnitState(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetInventoryCatalogStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.setCatalogActive(
      "units",
      organizationId,
      id,
      body.active,
      this.context(request),
    );
  }

  @Get("plants/:plantId/items")
  listItems(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Query() query: InventoryCatalogQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.listItems(
      organizationId,
      plantId,
      query,
      this.context(request),
    );
  }

  @Post("plants/:plantId/items")
  createItem(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Body() body: CreateInventoryItemDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.createCatalog(
      "items",
      { organizationId, plantId, ...body },
      this.context(request),
    );
  }

  @Patch("plants/:plantId/items/:id/state")
  setItemState(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: SetInventoryCatalogStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.setItemActive(
      organizationId,
      plantId,
      id,
      body.active,
      this.context(request),
    );
  }

  @Get("plants/:plantId/movements")
  listMovements(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Query() query: InventoryHistoryQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.listMovements(
      organizationId,
      plantId,
      query,
      this.context(request),
    );
  }

  @Get("plants/:plantId/stock")
  listStock(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Query() query: InventoryCatalogQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.listStock(
      organizationId,
      plantId,
      query,
      this.context(request),
    );
  }

  @Post("plants/:plantId/movements")
  recordMovement(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Body() body: RecordInventoryMovementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.recordMovement(
      organizationId,
      plantId,
      body,
      this.context(request),
    );
  }

  @Post("plants/:plantId/adjustments")
  recordAdjustment(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Body() body: RecordInventoryAdjustmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.recordAdjustment(
      organizationId,
      plantId,
      body,
      this.context(request),
    );
  }

  @Post("plants/:plantId/movements/:movementId/reversal")
  reverseMovement(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Param("movementId", ParseUUIDPipe) movementId: string,
    @Body() body: ReverseInventoryMovementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.reverseMovement(
      organizationId,
      plantId,
      movementId,
      body,
      this.context(request),
    );
  }

  @Post("plants/:plantId/reviews")
  recordReview(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Body() body: RecordInventoryReviewDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.recordReview(
      organizationId,
      plantId,
      body,
      this.context(request),
    );
  }

  @Get("plants/:plantId/reviews")
  listReviews(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Query() query: InventoryReviewHistoryQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.listReviews(
      organizationId,
      plantId,
      query,
      this.context(request),
    );
  }

  @Post("plants/:plantId/component-changes")
  recordComponentChange(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Body() body: RecordRastraComponentChangeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.recordComponentChange(
      organizationId,
      plantId,
      body,
      this.context(request),
    );
  }

  @Get("plants/:plantId/component-changes")
  listComponentChanges(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("plantId", ParseUUIDPipe) plantId: string,
    @Query() query: InventoryComponentHistoryQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.listComponentChanges(
      organizationId,
      plantId,
      query,
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
