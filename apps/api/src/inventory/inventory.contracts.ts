import type { PageResponse } from "../common/dto/page-query.dto";

export const INVENTORY_REPOSITORY = Symbol("INVENTORY_REPOSITORY");

export type InventoryCatalogResource = "item-types" | "units" | "items";
export type InventoryMovementType =
  "ENTRY" | "EXIT" | "CONSUMPTION" | "RETURN" | "ADJUSTMENT" | "REVERSAL";
export type InventoryRegularMovementType = Exclude<
  InventoryMovementType,
  "ADJUSTMENT" | "REVERSAL"
>;
export type RastraComponentChangeType =
  "INSTALLATION" | "REMOVAL" | "REPLACEMENT";

export interface InventoryListQuery {
  page: number;
  pageSize: number;
  search?: string;
  state?: "all" | "active" | "inactive";
  plantId?: string;
  inventoryItemId?: string;
  rastraId?: string;
  direction?: "asc" | "desc";
  differencesOnly?: boolean;
}

export interface ManagementInventoryStock {
  organizationId: string;
  plantId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  isActive: boolean;
  itemTypeId: string;
  itemTypeName: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  decimalPlaces: number;
  balance: number;
  firstMovementAtUtc: string | null;
  lastMovementAtUtc: string | null;
  movementCount: number;
  latestReviewId: string | null;
  latestReviewStatus: InventoryReview["status"] | null;
  latestReviewedAtUtc: string | null;
  latestExpectedQuantity: number | null;
  latestCountedQuantity: number | null;
  latestDifferenceQuantity: number | null;
}

export interface ManagementInventoryReviewLine extends InventoryReviewLine {
  organizationId: string;
  plantId: string;
  reviewId: string;
  status: InventoryReview["status"];
  reviewedByProfileId: string;
  reviewedByDisplayName: string;
  reviewedAtUtc: string;
  recordedAtUtc: string;
  notes: string | null;
  inventoryItemName: string;
  unitCode: string;
  unitName: string;
}

export interface ManagementRastraComponentChange extends RastraComponentChange {
  rastraName: string;
  productionLineId: string;
  productionLineName: string;
  inventoryItemName: string | null;
  unitCode: string | null;
  unitName: string | null;
  actorDisplayName: string;
  responsibleWorkerName: string | null;
  isActiveInstallation: boolean;
}

export interface InventoryCatalogItem {
  id: string;
  organizationId: string;
  code?: string;
  name: string;
  isActive: boolean;
  deactivatedAt: string | null;
  isCustom?: boolean;
  decimalPlaces?: number;
  plantId?: string;
  itemTypeId?: string;
  unitId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryCatalogItem {
  id: string;
  organizationId: string;
  code?: string;
  name: string;
  isCustom?: boolean;
  decimalPlaces?: number;
  plantId?: string;
  itemTypeId?: string;
  unitId?: string;
}

export interface InventoryMovement {
  id: string;
  organizationId: string;
  plantId: string;
  inventoryItemId: string;
  unitId: string;
  movementType: InventoryMovementType;
  quantityDelta: number;
  actorProfileId: string;
  responsibleWorkerId: string | null;
  occurredAtUtc: string;
  recordedAtUtc: string;
  reason: string | null;
  destination: string | null;
  notes: string | null;
  relatedMovementId: string | null;
}

export interface CreateInventoryMovement extends Omit<
  InventoryMovement,
  | "responsibleWorkerId"
  | "reason"
  | "destination"
  | "notes"
  | "relatedMovementId"
> {
  responsibleWorkerId?: string;
  reason?: string;
  destination?: string;
  notes?: string;
  relatedMovementId?: string;
}

export interface InventoryReviewLine {
  inventoryItemId: string;
  unitId: string;
  expectedQuantity: number;
  countedQuantity: number;
  differenceQuantity: number;
}

export interface InventoryReview {
  id: string;
  organizationId: string;
  plantId: string;
  status: "WITHOUT_DIFFERENCES" | "WITH_DIFFERENCES";
  reviewedByProfileId: string;
  reviewedAtUtc: string;
  recordedAtUtc: string;
  notes: string | null;
  lines: readonly InventoryReviewLine[];
}

export interface CreateInventoryReview extends Omit<InventoryReview, "notes"> {
  notes?: string;
}

export interface RastraComponentChange {
  id: string;
  organizationId: string;
  plantId: string;
  rastraId: string;
  changeType: RastraComponentChangeType;
  installationId: string;
  replacedInstallationId: string | null;
  inventoryItemId: string | null;
  unitId: string | null;
  quantity: number | null;
  actorProfileId: string;
  responsibleWorkerId: string | null;
  occurredAtUtc: string;
  recordedAtUtc: string;
  componentIdentifier: string | null;
  installedCondition: string | null;
  removedCondition: string | null;
  reason: string | null;
  installationNotes: string | null;
  removalNotes: string | null;
}

export interface CreateRastraComponentChange extends Omit<
  RastraComponentChange,
  | "replacedInstallationId"
  | "inventoryItemId"
  | "unitId"
  | "quantity"
  | "responsibleWorkerId"
  | "componentIdentifier"
  | "installedCondition"
  | "removedCondition"
  | "reason"
  | "installationNotes"
  | "removalNotes"
> {
  replacedInstallationId?: string;
  inventoryItemId?: string;
  unitId?: string;
  quantity?: number;
  responsibleWorkerId?: string;
  componentIdentifier?: string;
  installedCondition?: string;
  removedCondition?: string;
  reason?: string;
  installationNotes?: string;
  removalNotes?: string;
}

export interface InventoryRepository {
  hasPlantScope(
    organizationId: string,
    profileId: string,
    plantId: string,
  ): Promise<boolean>;
  listCatalog(
    resource: InventoryCatalogResource,
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<PageResponse<InventoryCatalogItem>>;
  findCatalog(
    resource: InventoryCatalogResource,
    organizationId: string,
    id: string,
  ): Promise<InventoryCatalogItem | null>;
  createCatalog(
    resource: InventoryCatalogResource,
    input: CreateInventoryCatalogItem,
  ): Promise<InventoryCatalogItem>;
  setCatalogActive(
    resource: InventoryCatalogResource,
    organizationId: string,
    id: string,
    active: boolean,
  ): Promise<InventoryCatalogItem | null>;
  listMovements(
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<PageResponse<InventoryMovement>>;
  listStock(
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<PageResponse<ManagementInventoryStock>>;
  listReviews(
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<PageResponse<ManagementInventoryReviewLine>>;
  listComponentChanges(
    organizationId: string,
    query: InventoryListQuery,
  ): Promise<PageResponse<ManagementRastraComponentChange>>;
  findMovement(
    organizationId: string,
    id: string,
  ): Promise<InventoryMovement | null>;
  getBalance(
    organizationId: string,
    plantId: string,
    inventoryItemId: string,
  ): Promise<number>;
  createMovement(input: CreateInventoryMovement): Promise<InventoryMovement>;
  createReview(input: CreateInventoryReview): Promise<InventoryReview>;
  createComponentChange(
    input: CreateRastraComponentChange,
  ): Promise<RastraComponentChange>;
}
