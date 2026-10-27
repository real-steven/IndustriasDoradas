import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import {
  INVENTORY_REPOSITORY,
  type CreateInventoryCatalogItem,
  type CreateInventoryMovement,
  type InventoryCatalogResource,
  type InventoryListQuery,
  type InventoryMovement,
  type InventoryRegularMovementType,
  type InventoryRepository,
  type RastraComponentChangeType,
} from "./inventory.contracts";
import { AUDIT_ACTIONS, type AuditActor } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import { ApplicationError } from "../common/errors/application-error";

export interface InventoryMutationContext {
  auth: AuthenticatedContext;
  correlationId: string;
}

interface RegularMovementInput {
  inventoryItemId: string;
  unitId: string;
  movementType: InventoryRegularMovementType;
  quantity: number;
  responsibleWorkerId?: string;
  occurredAtUtc: string;
  destination?: string;
  notes?: string;
  relatedMovementId?: string;
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly repository: InventoryRepository,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async listCatalog(
    resource: InventoryCatalogResource,
    organizationId: string,
    query: InventoryListQuery,
  ) {
    try {
      return await this.repository.listCatalog(resource, organizationId, query);
    } catch (error) {
      this.storageError(error);
    }
  }

  async listItems(
    organizationId: string,
    plantId: string,
    query: InventoryListQuery,
    context: InventoryMutationContext,
  ) {
    await this.ensurePlantScope(organizationId, plantId, context.auth);
    return this.listCatalog("items", organizationId, { ...query, plantId });
  }

  async createCatalog(
    resource: InventoryCatalogResource,
    input: Omit<CreateInventoryCatalogItem, "id">,
    context: InventoryMutationContext,
  ) {
    if (resource === "items") {
      if (
        input.plantId === undefined ||
        input.itemTypeId === undefined ||
        input.unitId === undefined
      ) {
        throw new ApplicationError(
          HttpStatus.BAD_REQUEST,
          "INVENTORY_ITEM_FIELDS_REQUIRED",
          "Plant, item type and unit are required",
        );
      }
      await this.ensurePlantScope(
        input.organizationId,
        input.plantId,
        context.auth,
      );
    }

    const id = randomUUID();
    const entityType = this.catalogEntityType(resource);
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId: input.organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType,
        entityId: id,
        failureResult: "REJECTED",
        failureReasonCode: "INVENTORY_CATALOG_REJECTED",
        allowedChangeFields: [
          "code",
          "name",
          "is_custom",
          "decimal_places",
          "plant_id",
          "item_type_id",
          "unit_id",
        ],
        changes: {
          ...(input.code === undefined
            ? {}
            : { code: { before: null, after: input.code } }),
          name: { before: null, after: input.name },
          ...(input.isCustom === undefined
            ? {}
            : { is_custom: { before: null, after: input.isCustom } }),
          ...(input.decimalPlaces === undefined
            ? {}
            : {
                decimal_places: {
                  before: null,
                  after: input.decimalPlaces,
                },
              }),
          ...(input.plantId === undefined
            ? {}
            : { plant_id: { before: null, after: input.plantId } }),
          ...(input.itemTypeId === undefined
            ? {}
            : { item_type_id: { before: null, after: input.itemTypeId } }),
          ...(input.unitId === undefined
            ? {}
            : { unit_id: { before: null, after: input.unitId } }),
        },
      },
      async () => {
        try {
          return await this.repository.createCatalog(resource, {
            id,
            ...input,
          });
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  async setCatalogActive(
    resource: Exclude<InventoryCatalogResource, "items">,
    organizationId: string,
    id: string,
    active: boolean,
    context: InventoryMutationContext,
  ) {
    return this.setActive(resource, organizationId, id, active, context);
  }

  async setItemActive(
    organizationId: string,
    plantId: string,
    id: string,
    active: boolean,
    context: InventoryMutationContext,
  ) {
    await this.ensurePlantScope(organizationId, plantId, context.auth);
    const item = await this.requireCatalog("items", organizationId, id);
    if (item.plantId !== plantId) this.notFound("inventory_item");
    return this.setActive("items", organizationId, id, active, context, item);
  }

  async listMovements(
    organizationId: string,
    plantId: string,
    query: InventoryListQuery,
    context: InventoryMutationContext,
  ) {
    await this.ensurePlantScope(organizationId, plantId, context.auth);
    try {
      return await this.repository.listMovements(organizationId, {
        ...query,
        plantId,
      });
    } catch (error) {
      this.storageError(error);
    }
  }

  async recordMovement(
    organizationId: string,
    plantId: string,
    input: RegularMovementInput,
    context: InventoryMutationContext,
  ) {
    await this.ensurePlantScope(organizationId, plantId, context.auth);
    if (
      input.movementType === "ENTRY" &&
      input.responsibleWorkerId !== undefined
    ) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "INVENTORY_ENTRY_WORKER_NOT_ALLOWED",
        "An entry does not assign a responsible worker",
      );
    }
    if (
      input.movementType !== "RETURN" &&
      input.relatedMovementId !== undefined
    ) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "INVENTORY_RELATED_MOVEMENT_NOT_ALLOWED",
        "Only a return may reference an earlier movement",
      );
    }

    const delta =
      input.movementType === "EXIT" || input.movementType === "CONSUMPTION"
        ? -input.quantity
        : input.quantity;
    return this.createMovement(
      {
        id: randomUUID(),
        organizationId,
        plantId,
        inventoryItemId: input.inventoryItemId,
        unitId: input.unitId,
        movementType: input.movementType,
        quantityDelta: delta,
        actorProfileId: context.auth.profile.id,
        occurredAtUtc: input.occurredAtUtc,
        recordedAtUtc: new Date().toISOString(),
        ...(input.responsibleWorkerId === undefined
          ? {}
          : { responsibleWorkerId: input.responsibleWorkerId }),
        ...(input.destination === undefined
          ? {}
          : { destination: input.destination }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.relatedMovementId === undefined
          ? {}
          : { relatedMovementId: input.relatedMovementId }),
      },
      context,
    );
  }

  async recordAdjustment(
    organizationId: string,
    plantId: string,
    input: {
      inventoryItemId: string;
      unitId: string;
      quantityDelta: number;
      reason: string;
      occurredAtUtc: string;
      notes?: string;
    },
    context: InventoryMutationContext,
  ) {
    await this.ensurePlantScope(organizationId, plantId, context.auth);
    if (input.quantityDelta === 0) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "INVENTORY_ADJUSTMENT_ZERO",
        "An adjustment must change the balance",
      );
    }
    return this.createMovement(
      {
        id: randomUUID(),
        organizationId,
        plantId,
        inventoryItemId: input.inventoryItemId,
        unitId: input.unitId,
        movementType: "ADJUSTMENT",
        quantityDelta: input.quantityDelta,
        actorProfileId: context.auth.profile.id,
        occurredAtUtc: input.occurredAtUtc,
        recordedAtUtc: new Date().toISOString(),
        reason: input.reason,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
      context,
    );
  }

  async reverseMovement(
    organizationId: string,
    plantId: string,
    movementId: string,
    input: { reason: string; occurredAtUtc: string },
    context: InventoryMutationContext,
  ) {
    await this.ensurePlantScope(organizationId, plantId, context.auth);
    let original: InventoryMovement | null;
    try {
      original = await this.repository.findMovement(organizationId, movementId);
    } catch (error) {
      this.storageError(error);
    }
    if (original === null || original.plantId !== plantId) {
      this.notFound("inventory_movement");
    }
    return this.createMovement(
      {
        id: randomUUID(),
        organizationId,
        plantId,
        inventoryItemId: original.inventoryItemId,
        unitId: original.unitId,
        movementType: "REVERSAL",
        quantityDelta: -original.quantityDelta,
        actorProfileId: context.auth.profile.id,
        occurredAtUtc: input.occurredAtUtc,
        recordedAtUtc: new Date().toISOString(),
        reason: input.reason,
        relatedMovementId: original.id,
      },
      context,
    );
  }

  async recordReview(
    organizationId: string,
    plantId: string,
    input: {
      reviewedAtUtc: string;
      lines: readonly {
        inventoryItemId: string;
        unitId: string;
        expectedQuantity: number;
        countedQuantity: number;
      }[];
      notes?: string;
    },
    context: InventoryMutationContext,
  ) {
    await this.ensurePlantScope(organizationId, plantId, context.auth);
    const ids = new Set(input.lines.map((line) => line.inventoryItemId));
    if (ids.size !== input.lines.length) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "INVENTORY_REVIEW_DUPLICATE_ITEM",
        "A review cannot contain the same item twice",
      );
    }
    const lines = input.lines.map((line) => ({
      ...line,
      differenceQuantity: this.roundQuantity(
        line.countedQuantity - line.expectedQuantity,
      ),
    }));
    const status = lines.some((line) => line.differenceQuantity !== 0)
      ? "WITH_DIFFERENCES"
      : "WITHOUT_DIFFERENCES";
    const id = randomUUID();
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "inventory_review",
        entityId: id,
        failureResult: "REJECTED",
        failureReasonCode: "INVENTORY_REVIEW_REJECTED",
        allowedChangeFields: ["status", "line_count"],
        changes: {
          status: { before: null, after: status },
          line_count: { before: null, after: lines.length },
        },
      },
      async () => {
        try {
          return await this.repository.createReview({
            id,
            organizationId,
            plantId,
            status,
            reviewedByProfileId: context.auth.profile.id,
            reviewedAtUtc: input.reviewedAtUtc,
            recordedAtUtc: new Date().toISOString(),
            lines,
            ...(input.notes === undefined ? {} : { notes: input.notes }),
          });
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  async recordComponentChange(
    organizationId: string,
    plantId: string,
    input: {
      rastraId: string;
      changeType: RastraComponentChangeType;
      installationId: string;
      replacedInstallationId?: string;
      inventoryItemId?: string;
      unitId?: string;
      quantity?: number;
      responsibleWorkerId?: string;
      occurredAtUtc: string;
      componentIdentifier?: string;
      installedCondition?: string;
      removedCondition?: string;
      reason?: string;
      installationNotes?: string;
      removalNotes?: string;
    },
    context: InventoryMutationContext,
  ) {
    await this.ensurePlantScope(organizationId, plantId, context.auth);
    this.validateComponentShape(input);
    const id = randomUUID();
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "rastra_component_change",
        entityId: id,
        failureResult: "REJECTED",
        failureReasonCode: "INVENTORY_COMPONENT_REJECTED",
        allowedChangeFields: [
          "rastra_id",
          "change_type",
          "installation_id",
          "replaced_installation_id",
          "inventory_item_id",
          "quantity",
          "reason",
        ],
        changes: {
          rastra_id: { before: null, after: input.rastraId },
          change_type: { before: null, after: input.changeType },
          installation_id: { before: null, after: input.installationId },
          ...(input.replacedInstallationId === undefined
            ? {}
            : {
                replaced_installation_id: {
                  before: null,
                  after: input.replacedInstallationId,
                },
              }),
          ...(input.inventoryItemId === undefined
            ? {}
            : {
                inventory_item_id: {
                  before: null,
                  after: input.inventoryItemId,
                },
              }),
          ...(input.quantity === undefined
            ? {}
            : { quantity: { before: null, after: input.quantity } }),
          ...(input.reason === undefined
            ? {}
            : { reason: { before: null, after: input.reason } }),
        },
      },
      async () => {
        try {
          return await this.repository.createComponentChange({
            id,
            organizationId,
            plantId,
            actorProfileId: context.auth.profile.id,
            recordedAtUtc: new Date().toISOString(),
            ...input,
          });
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  private async createMovement(
    movement: CreateInventoryMovement,
    context: InventoryMutationContext,
  ) {
    await this.requireActiveItem(
      movement.organizationId,
      movement.plantId,
      movement.inventoryItemId,
      movement.unitId,
    );
    if (movement.quantityDelta < 0) {
      await this.ensureAvailable(
        movement.organizationId,
        movement.plantId,
        movement.inventoryItemId,
        Math.abs(movement.quantityDelta),
      );
    }
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId: movement.organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "inventory_movement",
        entityId: movement.id,
        failureResult: "REJECTED",
        failureReasonCode: "INVENTORY_MOVEMENT_REJECTED",
        allowedChangeFields: [
          "inventory_item_id",
          "movement_type",
          "quantity_delta",
          "reason",
          "related_movement_id",
        ],
        changes: {
          inventory_item_id: {
            before: null,
            after: movement.inventoryItemId,
          },
          movement_type: { before: null, after: movement.movementType },
          quantity_delta: { before: null, after: movement.quantityDelta },
          ...(movement.reason === undefined
            ? {}
            : { reason: { before: null, after: movement.reason } }),
          ...(movement.relatedMovementId === undefined
            ? {}
            : {
                related_movement_id: {
                  before: null,
                  after: movement.relatedMovementId,
                },
              }),
        },
      },
      async () => {
        try {
          return await this.repository.createMovement(movement);
        } catch (error) {
          if (
            error instanceof SupabaseDataError &&
            error.databaseMessage === "INVENTORY_STOCK_INSUFFICIENT"
          ) {
            await this.ensureAvailable(
              movement.organizationId,
              movement.plantId,
              movement.inventoryItemId,
              Math.abs(movement.quantityDelta),
              true,
            );
          }
          this.storageError(error);
        }
      },
    );
  }

  private async ensurePlantScope(
    organizationId: string,
    plantId: string,
    auth: AuthenticatedContext,
  ): Promise<void> {
    if (auth.profile.role.code === "JEFE_EMPRESA") return;
    let allowed: boolean;
    try {
      allowed = await this.repository.hasPlantScope(
        organizationId,
        auth.profile.id,
        plantId,
      );
    } catch (error) {
      this.storageError(error);
    }
    if (!allowed) {
      throw new ApplicationError(
        HttpStatus.FORBIDDEN,
        "INVENTORY_PLANT_NOT_AUTHORIZED",
        "The plant is outside the manager scope",
      );
    }
  }

  private async requireActiveItem(
    organizationId: string,
    plantId: string,
    itemId: string,
    unitId: string,
  ): Promise<void> {
    const item = await this.requireCatalog("items", organizationId, itemId);
    if (!item.isActive || item.plantId !== plantId || item.unitId !== unitId) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "INVENTORY_ITEM_UNIT_INVALID",
        "The active item, plant and unit must match",
      );
    }
  }

  private async ensureAvailable(
    organizationId: string,
    plantId: string,
    itemId: string,
    requested: number,
    force = false,
  ): Promise<void> {
    let available: number;
    try {
      available = await this.repository.getBalance(
        organizationId,
        plantId,
        itemId,
      );
    } catch (error) {
      this.storageError(error);
    }
    if (force || requested > available) {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "INVENTORY_STOCK_INSUFFICIENT",
        `Requested quantity ${requested} exceeds available quantity ${available}`,
      );
    }
  }

  private async setActive(
    resource: InventoryCatalogResource,
    organizationId: string,
    id: string,
    active: boolean,
    context: InventoryMutationContext,
    knownItem?: Awaited<ReturnType<InventoryService["requireCatalog"]>>,
  ) {
    const before =
      knownItem ?? (await this.requireCatalog(resource, organizationId, id));
    if (before.isActive === active) {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "INVENTORY_CATALOG_STATE_UNCHANGED",
        "The catalog item already has the requested state",
      );
    }
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: this.catalogEntityType(resource),
        entityId: id,
        failureResult: "REJECTED",
        failureReasonCode: "INVENTORY_CATALOG_STATE_REJECTED",
        allowedChangeFields: ["is_active"],
        changes: { is_active: { before: before.isActive, after: active } },
      },
      async () => {
        try {
          const result = await this.repository.setCatalogActive(
            resource,
            organizationId,
            id,
            active,
          );
          if (result === null) this.notFound(this.catalogEntityType(resource));
          return result;
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  private async requireCatalog(
    resource: InventoryCatalogResource,
    organizationId: string,
    id: string,
  ) {
    try {
      const item = await this.repository.findCatalog(
        resource,
        organizationId,
        id,
      );
      if (item === null) this.notFound(this.catalogEntityType(resource));
      return item;
    } catch (error) {
      this.storageError(error);
    }
  }

  private validateComponentShape(input: {
    changeType: RastraComponentChangeType;
    replacedInstallationId?: string;
    inventoryItemId?: string;
    unitId?: string;
    quantity?: number;
    installedCondition?: string;
    removedCondition?: string;
    reason?: string;
  }): void {
    const installing = input.changeType !== "REMOVAL";
    if (
      installing &&
      (input.inventoryItemId === undefined ||
        input.unitId === undefined ||
        input.quantity === undefined ||
        input.installedCondition === undefined)
    ) {
      this.invalidComponent();
    }
    if (
      input.changeType === "REPLACEMENT" &&
      (input.replacedInstallationId === undefined ||
        input.removedCondition === undefined ||
        input.reason === undefined)
    ) {
      this.invalidComponent();
    }
    if (
      input.changeType === "REMOVAL" &&
      (input.removedCondition === undefined || input.reason === undefined)
    ) {
      this.invalidComponent();
    }
  }

  private invalidComponent(): never {
    throw new ApplicationError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "INVENTORY_COMPONENT_FIELDS_INVALID",
      "The component change fields do not match its type",
    );
  }

  private roundQuantity(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private catalogEntityType(resource: InventoryCatalogResource): string {
    return {
      "item-types": "inventory_item_type",
      units: "inventory_unit",
      items: "inventory_item",
    }[resource];
  }

  private notFound(entity: string): never {
    throw new ApplicationError(
      HttpStatus.NOT_FOUND,
      "INVENTORY_NOT_FOUND",
      `${entity} was not found`,
    );
  }

  private actor(auth: AuthenticatedContext): AuditActor {
    return {
      kind: "AUTHENTICATED_USER",
      profileId: auth.profile.id,
      authUserId: auth.profile.authUserId,
      displayName: auth.profile.displayName,
      roleCode: auth.profile.role.code,
    };
  }

  private storageError(error: unknown): never {
    if (!(error instanceof SupabaseDataError)) throw error;
    if (error.databaseMessage === "INVENTORY_STOCK_INSUFFICIENT") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "INVENTORY_STOCK_INSUFFICIENT",
        "The movement exceeds the available quantity",
      );
    }
    if (error.databaseCode === "23505") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "INVENTORY_CONFLICT",
        "The inventory fact already exists or changed concurrently",
      );
    }
    if (error.databaseCode === "23503") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "INVENTORY_REFERENCE_INVALID",
        "An inventory reference does not exist or belongs to another scope",
      );
    }
    if (error.databaseCode === "23514") {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "INVENTORY_RULE_VIOLATION",
        error.databaseMessage ?? "The inventory operation violates a rule",
      );
    }
    if (error.databaseCode === "55000") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "INVENTORY_HISTORY_IMMUTABLE",
        "Inventory history cannot be changed or deleted",
      );
    }
    throw new ApplicationError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "INVENTORY_STORAGE_UNAVAILABLE",
      "Inventory storage is temporarily unavailable",
    );
  }
}
