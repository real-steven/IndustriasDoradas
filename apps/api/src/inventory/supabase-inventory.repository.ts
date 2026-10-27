import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  type CreateInventoryCatalogItem,
  type CreateInventoryMovement,
  type CreateInventoryReview,
  type CreateRastraComponentChange,
  type InventoryCatalogItem,
  type InventoryCatalogResource,
  type InventoryListQuery,
  type InventoryMovement,
  type InventoryRepository,
  type InventoryReview,
  type ManagementInventoryReviewLine,
  type ManagementInventoryStock,
  type ManagementRastraComponentChange,
  type RastraComponentChange,
} from "./inventory.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { PageResponse } from "../common/dto/page-query.dto";
import type { EnvironmentVariables } from "../config/environment";

type Row = Record<string, unknown>;

interface ErrorBody {
  code?: unknown;
  message?: unknown;
}

@Injectable()
export class SupabaseInventoryRepository implements InventoryRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async hasPlantScope(
    organizationId: string,
    profileId: string,
    plantId: string,
  ): Promise<boolean> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      user_profile_id: `eq.${profileId}`,
      plant_id: `eq.${plantId}`,
      is_active: "eq.true",
      select: "plant_id",
      limit: "1",
    });
    const response = await this.request(`user_plant_scopes?${parameters}`);
    const rows = (await response.json()) as Row[];
    return rows.length === 1;
  }

  async listCatalog(
    resource: InventoryCatalogResource,
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<PageResponse<InventoryCatalogItem>> {
    const parameters = this.pageParameters(query);
    parameters.set("organization_id", `eq.${organizationId}`);
    parameters.set("select", "*");
    parameters.set("order", "name.asc,id.asc");
    if (query.search?.trim()) {
      parameters.set("name", `ilike.*${this.escapeLike(query.search.trim())}*`);
    }
    if (query.state !== undefined && query.state !== "all") {
      parameters.set("is_active", `eq.${query.state === "active"}`);
    }
    if (resource === "items" && query.plantId !== undefined) {
      parameters.set("plant_id", `eq.${query.plantId}`);
    }
    const response = await this.request(
      `${this.catalogTable(resource)}?${parameters}`,
      { headers: { Prefer: "count=exact" } },
    );
    const rows = (await response.json()) as Row[];
    return this.page(
      query,
      response,
      rows.map((row) => this.catalogItem(resource, row)),
    );
  }

  async findCatalog(
    resource: InventoryCatalogResource,
    organizationId: string,
    id: string,
  ): Promise<InventoryCatalogItem | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${id}`,
      select: "*",
      limit: "1",
    });
    const response = await this.request(
      `${this.catalogTable(resource)}?${parameters}`,
    );
    const rows = (await response.json()) as Row[];
    return rows[0] === undefined ? null : this.catalogItem(resource, rows[0]);
  }

  async createCatalog(
    resource: InventoryCatalogResource,
    input: CreateInventoryCatalogItem,
  ): Promise<InventoryCatalogItem> {
    const row: Row = {
      id: input.id,
      organization_id: input.organizationId,
      name: input.name,
    };
    if (input.code !== undefined) row.code = input.code;
    if (input.isCustom !== undefined) row.is_custom = input.isCustom;
    if (input.decimalPlaces !== undefined)
      row.decimal_places = input.decimalPlaces;
    if (input.plantId !== undefined) row.plant_id = input.plantId;
    if (input.itemTypeId !== undefined) row.item_type_id = input.itemTypeId;
    if (input.unitId !== undefined) row.unit_id = input.unitId;

    const response = await this.request(this.catalogTable(resource), {
      body: JSON.stringify(row),
      headers: { Prefer: "return=representation" },
      method: "POST",
    });
    const rows = (await response.json()) as Row[];
    const created = rows[0];
    if (created === undefined)
      throw new SupabaseDataError(
        "EMPTY_RESPONSE",
        this.catalogTable(resource),
      );
    return this.catalogItem(resource, created);
  }

  async setCatalogActive(
    resource: InventoryCatalogResource,
    organizationId: string,
    id: string,
    active: boolean,
  ): Promise<InventoryCatalogItem | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${id}`,
    });
    const response = await this.request(
      `${this.catalogTable(resource)}?${parameters}`,
      {
        body: JSON.stringify({
          is_active: active,
          deactivated_at: active ? null : new Date().toISOString(),
        }),
        headers: { Prefer: "return=representation" },
        method: "PATCH",
      },
    );
    const rows = (await response.json()) as Row[];
    return rows[0] === undefined ? null : this.catalogItem(resource, rows[0]);
  }

  async listMovements(
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<PageResponse<InventoryMovement>> {
    const parameters = this.pageParameters(query);
    parameters.set("organization_id", `eq.${organizationId}`);
    parameters.set("select", "*");
    const direction = query.direction ?? "desc";
    parameters.set("order", `occurred_at_utc.${direction},id.${direction}`);
    if (query.plantId !== undefined)
      parameters.set("plant_id", `eq.${query.plantId}`);
    if (query.inventoryItemId !== undefined) {
      parameters.set("inventory_item_id", `eq.${query.inventoryItemId}`);
    }
    const response = await this.request(`inventory_movements?${parameters}`, {
      headers: { Prefer: "count=exact" },
    });
    const rows = (await response.json()) as Row[];
    return this.page(
      query,
      response,
      rows.map((row) => this.movement(row)),
    );
  }

  async listStock(
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<PageResponse<ManagementInventoryStock>> {
    const parameters = this.pageParameters(query);
    parameters.set("organization_id", `eq.${organizationId}`);
    parameters.set("select", "*");
    parameters.set("order", "inventory_item_name.asc,inventory_item_id.asc");
    if (query.plantId !== undefined)
      parameters.set("plant_id", `eq.${query.plantId}`);
    if (query.search?.trim()) {
      parameters.set(
        "inventory_item_name",
        `ilike.*${this.escapeLike(query.search.trim())}*`,
      );
    }
    if (query.state !== undefined && query.state !== "all") {
      parameters.set("is_active", `eq.${query.state === "active"}`);
    }
    const response = await this.request(
      `management_inventory_stock?${parameters}`,
      { headers: { Prefer: "count=exact" } },
    );
    const rows = (await response.json()) as Row[];
    return this.page(
      query,
      response,
      rows.map((row) => this.managementStock(row)),
    );
  }

  async listReviews(
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<PageResponse<ManagementInventoryReviewLine>> {
    const parameters = this.pageParameters(query);
    parameters.set("organization_id", `eq.${organizationId}`);
    parameters.set("select", "*");
    parameters.set("order", "reviewed_at_utc.desc,review_id.desc");
    if (query.plantId !== undefined)
      parameters.set("plant_id", `eq.${query.plantId}`);
    if (query.inventoryItemId !== undefined) {
      parameters.set("inventory_item_id", `eq.${query.inventoryItemId}`);
    }
    if (query.differencesOnly === true) {
      parameters.set("difference_quantity", "neq.0");
    }
    if (query.search?.trim()) {
      parameters.set(
        "inventory_item_name",
        `ilike.*${this.escapeLike(query.search.trim())}*`,
      );
    }
    const response = await this.request(
      `management_inventory_review_lines?${parameters}`,
      { headers: { Prefer: "count=exact" } },
    );
    const rows = (await response.json()) as Row[];
    return this.page(
      query,
      response,
      rows.map((row) => this.managementReviewLine(row)),
    );
  }

  async listComponentChanges(
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<PageResponse<ManagementRastraComponentChange>> {
    const parameters = this.pageParameters(query);
    const direction = query.direction ?? "desc";
    parameters.set("organization_id", `eq.${organizationId}`);
    parameters.set("select", "*");
    parameters.set("order", `occurred_at_utc.${direction},id.${direction}`);
    if (query.plantId !== undefined)
      parameters.set("plant_id", `eq.${query.plantId}`);
    if (query.rastraId !== undefined)
      parameters.set("rastra_id", `eq.${query.rastraId}`);
    if (query.search?.trim()) {
      parameters.set(
        "rastra_name",
        `ilike.*${this.escapeLike(query.search.trim())}*`,
      );
    }
    const response = await this.request(
      `management_rastra_component_history?${parameters}`,
      { headers: { Prefer: "count=exact" } },
    );
    const rows = (await response.json()) as Row[];
    return this.page(
      query,
      response,
      rows.map((row) => this.managementComponentChange(row)),
    );
  }

  async findMovement(
    organizationId: string,
    id: string,
  ): Promise<InventoryMovement | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${id}`,
      select: "*",
      limit: "1",
    });
    const response = await this.request(`inventory_movements?${parameters}`);
    const rows = (await response.json()) as Row[];
    return rows[0] === undefined ? null : this.movement(rows[0]);
  }

  async getBalance(
    organizationId: string,
    plantId: string,
    inventoryItemId: string,
  ): Promise<number> {
    const response = await this.request("rpc/inventory_balance_v1", {
      body: JSON.stringify({
        target_organization_id: organizationId,
        target_plant_id: plantId,
        target_inventory_item_id: inventoryItemId,
      }),
      method: "POST",
    });
    return this.numberValue(await response.json(), "inventory_balance_v1");
  }

  async createMovement(
    input: CreateInventoryMovement,
  ): Promise<InventoryMovement> {
    const response = await this.request("inventory_movements", {
      body: JSON.stringify({
        id: input.id,
        organization_id: input.organizationId,
        plant_id: input.plantId,
        inventory_item_id: input.inventoryItemId,
        unit_id: input.unitId,
        movement_type: input.movementType,
        quantity_delta: input.quantityDelta,
        actor_profile_id: input.actorProfileId,
        responsible_worker_id: input.responsibleWorkerId ?? null,
        occurred_at_utc: input.occurredAtUtc,
        recorded_at_utc: input.recordedAtUtc,
        reason: input.reason ?? null,
        destination: input.destination ?? null,
        notes: input.notes ?? null,
        related_movement_id: input.relatedMovementId ?? null,
      }),
      headers: { Prefer: "return=representation" },
      method: "POST",
    });
    const rows = (await response.json()) as Row[];
    const row = rows[0];
    if (row === undefined)
      throw new SupabaseDataError("EMPTY_RESPONSE", "inventory_movements");
    return this.movement(row);
  }

  async createReview(input: CreateInventoryReview): Promise<InventoryReview> {
    const response = await this.request("rpc/record_inventory_review_v1", {
      body: JSON.stringify({
        target_review_id: input.id,
        target_organization_id: input.organizationId,
        target_plant_id: input.plantId,
        reviewer_profile_id: input.reviewedByProfileId,
        review_status: input.status,
        reviewed_moment: input.reviewedAtUtc,
        recorded_moment: input.recordedAtUtc,
        review_notes: input.notes ?? null,
        review_lines: input.lines.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          unitId: line.unitId,
          expectedQuantity: line.expectedQuantity,
          countedQuantity: line.countedQuantity,
          differenceQuantity: line.differenceQuantity,
        })),
      }),
      method: "POST",
    });
    return this.review(await response.json());
  }

  async createComponentChange(
    input: CreateRastraComponentChange,
  ): Promise<RastraComponentChange> {
    const response = await this.request("rastra_component_changes", {
      body: JSON.stringify({
        id: input.id,
        organization_id: input.organizationId,
        plant_id: input.plantId,
        rastra_id: input.rastraId,
        change_type: input.changeType,
        installation_id: input.installationId,
        replaced_installation_id: input.replacedInstallationId ?? null,
        inventory_item_id: input.inventoryItemId ?? null,
        unit_id: input.unitId ?? null,
        quantity: input.quantity ?? null,
        actor_profile_id: input.actorProfileId,
        responsible_worker_id: input.responsibleWorkerId ?? null,
        occurred_at_utc: input.occurredAtUtc,
        recorded_at_utc: input.recordedAtUtc,
        component_identifier: input.componentIdentifier ?? null,
        installed_condition: input.installedCondition ?? null,
        removed_condition: input.removedCondition ?? null,
        reason: input.reason ?? null,
        installation_notes: input.installationNotes ?? null,
        removal_notes: input.removalNotes ?? null,
      }),
      headers: { Prefer: "return=representation" },
      method: "POST",
    });
    const rows = (await response.json()) as Row[];
    const row = rows[0];
    if (row === undefined)
      throw new SupabaseDataError("EMPTY_RESPONSE", "rastra_component_changes");
    return this.componentChange(row);
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetch(`${this.restUrl}/${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Accept-Profile": "app",
        apikey: this.secret,
        Authorization: `Bearer ${this.secret}`,
        "Content-Profile": "app",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ErrorBody;
      throw new SupabaseDataError(
        typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
        path.split("?")[0] ?? "inventory",
        typeof body.message === "string" ? body.message : undefined,
      );
    }
    return response;
  }

  private catalogTable(resource: InventoryCatalogResource): string {
    return {
      "item-types": "inventory_item_types",
      units: "inventory_units",
      items: "inventory_items",
    }[resource];
  }

  private catalogItem(
    resource: InventoryCatalogResource,
    row: Row,
  ): InventoryCatalogItem {
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      ...(typeof row.code === "string" ? { code: row.code } : {}),
      name: this.string(row, "name"),
      isActive: this.boolean(row, "is_active"),
      deactivatedAt: this.nullableString(row, "deactivated_at"),
      ...(resource === "item-types" || resource === "units"
        ? { isCustom: this.boolean(row, "is_custom") }
        : {}),
      ...(resource === "units"
        ? { decimalPlaces: this.number(row, "decimal_places") }
        : {}),
      ...(resource === "items"
        ? {
            plantId: this.string(row, "plant_id"),
            itemTypeId: this.string(row, "item_type_id"),
            unitId: this.string(row, "unit_id"),
          }
        : {}),
      createdAt: this.string(row, "created_at"),
      updatedAt: this.string(row, "updated_at"),
    };
  }

  private movement(row: Row): InventoryMovement {
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      plantId: this.string(row, "plant_id"),
      inventoryItemId: this.string(row, "inventory_item_id"),
      unitId: this.string(row, "unit_id"),
      movementType: this.string(
        row,
        "movement_type",
      ) as InventoryMovement["movementType"],
      quantityDelta: this.number(row, "quantity_delta"),
      actorProfileId: this.string(row, "actor_profile_id"),
      responsibleWorkerId: this.nullableString(row, "responsible_worker_id"),
      occurredAtUtc: this.string(row, "occurred_at_utc"),
      recordedAtUtc: this.string(row, "recorded_at_utc"),
      reason: this.nullableString(row, "reason"),
      destination: this.nullableString(row, "destination"),
      notes: this.nullableString(row, "notes"),
      relatedMovementId: this.nullableString(row, "related_movement_id"),
    };
  }

  private review(value: unknown): InventoryReview {
    const row = this.object(value, "record_inventory_review_v1");
    const lines = row.lines;
    if (!Array.isArray(lines))
      throw new SupabaseDataError("INVALID_ROW", "review_lines");
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organizationId"),
      plantId: this.string(row, "plantId"),
      status: this.string(row, "status") as InventoryReview["status"],
      reviewedByProfileId: this.string(row, "reviewedByProfileId"),
      reviewedAtUtc: this.string(row, "reviewedAtUtc"),
      recordedAtUtc: this.string(row, "recordedAtUtc"),
      notes: this.nullableString(row, "notes"),
      lines: lines.map((line) => {
        const item = this.object(line, "review_line");
        return {
          inventoryItemId: this.string(item, "inventoryItemId"),
          unitId: this.string(item, "unitId"),
          expectedQuantity: this.number(item, "expectedQuantity"),
          countedQuantity: this.number(item, "countedQuantity"),
          differenceQuantity: this.number(item, "differenceQuantity"),
        };
      }),
    };
  }

  private componentChange(row: Row): RastraComponentChange {
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      plantId: this.string(row, "plant_id"),
      rastraId: this.string(row, "rastra_id"),
      changeType: this.string(
        row,
        "change_type",
      ) as RastraComponentChange["changeType"],
      installationId: this.string(row, "installation_id"),
      replacedInstallationId: this.nullableString(
        row,
        "replaced_installation_id",
      ),
      inventoryItemId: this.nullableString(row, "inventory_item_id"),
      unitId: this.nullableString(row, "unit_id"),
      quantity: this.nullableNumber(row, "quantity"),
      actorProfileId: this.string(row, "actor_profile_id"),
      responsibleWorkerId: this.nullableString(row, "responsible_worker_id"),
      occurredAtUtc: this.string(row, "occurred_at_utc"),
      recordedAtUtc: this.string(row, "recorded_at_utc"),
      componentIdentifier: this.nullableString(row, "component_identifier"),
      installedCondition: this.nullableString(row, "installed_condition"),
      removedCondition: this.nullableString(row, "removed_condition"),
      reason: this.nullableString(row, "reason"),
      installationNotes: this.nullableString(row, "installation_notes"),
      removalNotes: this.nullableString(row, "removal_notes"),
    };
  }

  private managementStock(row: Row): ManagementInventoryStock {
    return {
      organizationId: this.string(row, "organization_id"),
      plantId: this.string(row, "plant_id"),
      inventoryItemId: this.string(row, "inventory_item_id"),
      inventoryItemName: this.string(row, "inventory_item_name"),
      isActive: this.boolean(row, "is_active"),
      itemTypeId: this.string(row, "item_type_id"),
      itemTypeName: this.string(row, "item_type_name"),
      unitId: this.string(row, "unit_id"),
      unitCode: this.string(row, "unit_code"),
      unitName: this.string(row, "unit_name"),
      decimalPlaces: this.number(row, "decimal_places"),
      balance: this.number(row, "balance"),
      firstMovementAtUtc: this.nullableString(row, "first_movement_at_utc"),
      lastMovementAtUtc: this.nullableString(row, "last_movement_at_utc"),
      movementCount: this.number(row, "movement_count"),
      latestReviewId: this.nullableString(row, "latest_review_id"),
      latestReviewStatus: this.nullableString(
        row,
        "latest_review_status",
      ) as ManagementInventoryStock["latestReviewStatus"],
      latestReviewedAtUtc: this.nullableString(row, "latest_reviewed_at_utc"),
      latestExpectedQuantity: this.nullableNumber(
        row,
        "latest_expected_quantity",
      ),
      latestCountedQuantity: this.nullableNumber(
        row,
        "latest_counted_quantity",
      ),
      latestDifferenceQuantity: this.nullableNumber(
        row,
        "latest_difference_quantity",
      ),
    };
  }

  private managementReviewLine(row: Row): ManagementInventoryReviewLine {
    return {
      organizationId: this.string(row, "organization_id"),
      plantId: this.string(row, "plant_id"),
      reviewId: this.string(row, "review_id"),
      status: this.string(
        row,
        "status",
      ) as ManagementInventoryReviewLine["status"],
      reviewedByProfileId: this.string(row, "reviewed_by_profile_id"),
      reviewedByDisplayName: this.string(row, "reviewed_by_display_name"),
      reviewedAtUtc: this.string(row, "reviewed_at_utc"),
      recordedAtUtc: this.string(row, "recorded_at_utc"),
      notes: this.nullableString(row, "notes"),
      inventoryItemId: this.string(row, "inventory_item_id"),
      inventoryItemName: this.string(row, "inventory_item_name"),
      unitId: this.string(row, "unit_id"),
      unitCode: this.string(row, "unit_code"),
      unitName: this.string(row, "unit_name"),
      expectedQuantity: this.number(row, "expected_quantity"),
      countedQuantity: this.number(row, "counted_quantity"),
      differenceQuantity: this.number(row, "difference_quantity"),
    };
  }

  private managementComponentChange(row: Row): ManagementRastraComponentChange {
    return {
      ...this.componentChange(row),
      rastraName: this.string(row, "rastra_name"),
      productionLineId: this.string(row, "production_line_id"),
      productionLineName: this.string(row, "production_line_name"),
      inventoryItemName: this.nullableString(row, "inventory_item_name"),
      unitCode: this.nullableString(row, "unit_code"),
      unitName: this.nullableString(row, "unit_name"),
      actorDisplayName: this.string(row, "actor_display_name"),
      responsibleWorkerName: this.nullableString(
        row,
        "responsible_worker_name",
      ),
      isActiveInstallation: this.boolean(row, "is_active_installation"),
    };
  }

  private pageParameters(query: InventoryListQuery): URLSearchParams {
    return new URLSearchParams({
      limit: String(query.pageSize),
      offset: String((query.page - 1) * query.pageSize),
    });
  }

  private page<T>(
    query: InventoryListQuery,
    response: Response,
    items: readonly T[],
  ): PageResponse<T> {
    const value = response.headers.get("content-range")?.split("/")[1];
    const total =
      value !== undefined && /^\d+$/u.test(value)
        ? Number(value)
        : items.length;
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  private object(value: unknown, source: string): Row {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new SupabaseDataError("INVALID_ROW", source);
    }
    return value as Row;
  }

  private string(row: Row, key: string): string {
    const value = row[key];
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private nullableString(row: Row, key: string): string | null {
    const value = row[key];
    return value === null || value === undefined ? null : this.string(row, key);
  }

  private boolean(row: Row, key: string): boolean {
    const value = row[key];
    if (typeof value !== "boolean")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private number(row: Row, key: string): number {
    return this.numberValue(row[key], key);
  }

  private numberValue(value: unknown, source: string): number {
    const parsed = typeof value === "string" ? Number(value) : value;
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
      throw new SupabaseDataError("INVALID_ROW", source);
    }
    return parsed;
  }

  private nullableNumber(row: Row, key: string): number | null {
    const value = row[key];
    return value === null || value === undefined
      ? null
      : this.numberValue(value, key);
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
  }
}
