import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import type { PageCatalog } from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { useAuth } from "../../auth/auth-context";

export type InventoryView =
  | "stock"
  | "kardex"
  | "reviews"
  | "components"
  | "novelties"
  | "catalog"
  | "actions";

export interface InventoryFilters {
  view: InventoryView;
  plantId?: string;
  inventoryItemId?: string;
  rastraId?: string;
  search: string;
  page: number;
  differencesOnly: boolean;
  reviewReminderDays: number;
  replacementReminderDays: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface InventoryCatalogEntry {
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

export interface CreateInventoryItemTypeInput {
  code: string;
  name: string;
  isCustom: boolean;
}

export interface CreateInventoryUnitInput extends CreateInventoryItemTypeInput {
  decimalPlaces: number;
}

export interface CreateInventoryItemInput {
  itemTypeId: string;
  unitId: string;
  name: string;
}

export interface InventoryStock {
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
  latestReviewStatus: "WITHOUT_DIFFERENCES" | "WITH_DIFFERENCES" | null;
  latestReviewedAtUtc: string | null;
  latestExpectedQuantity: number | null;
  latestCountedQuantity: number | null;
  latestDifferenceQuantity: number | null;
}

export interface InventoryMovement {
  id: string;
  inventoryItemId: string;
  unitId: string;
  movementType:
    "ENTRY" | "EXIT" | "CONSUMPTION" | "RETURN" | "ADJUSTMENT" | "REVERSAL";
  quantityDelta: number;
  occurredAtUtc: string;
  recordedAtUtc: string;
  reason: string | null;
  destination: string | null;
  notes: string | null;
  relatedMovementId: string | null;
  linkedSweepId: string | null;
}

export interface RecordInventoryMovementInput {
  inventoryItemId: string;
  unitId: string;
  movementType: "ENTRY" | "EXIT" | "CONSUMPTION" | "RETURN";
  quantity: number;
  occurredAtUtc: string;
  destination?: string;
  notes?: string;
  relatedMovementId?: string;
}

export interface RecordInventoryAdjustmentInput {
  inventoryItemId: string;
  unitId: string;
  quantityDelta: number;
  reason: string;
  occurredAtUtc: string;
  notes?: string;
}

export interface RecordInventoryReviewInput {
  reviewedAtUtc: string;
  lines: Array<{
    inventoryItemId: string;
    unitId: string;
    expectedQuantity: number;
    countedQuantity: number;
  }>;
  notes?: string;
}

export interface InventoryReviewLine {
  reviewId: string;
  status: "WITHOUT_DIFFERENCES" | "WITH_DIFFERENCES";
  reviewedByDisplayName: string;
  reviewedAtUtc: string;
  recordedAtUtc: string;
  notes: string | null;
  inventoryItemId: string;
  inventoryItemName: string;
  unitCode: string;
  unitName: string;
  expectedQuantity: number;
  countedQuantity: number;
  differenceQuantity: number;
}

export interface RastraComponentChange {
  id: string;
  rastraId: string;
  rastraName: string;
  productionLineName: string;
  changeType: "INSTALLATION" | "REMOVAL" | "REPLACEMENT";
  installationId: string;
  replacedInstallationId: string | null;
  inventoryItemName: string | null;
  unitCode: string | null;
  unitName: string | null;
  quantity: number | null;
  actorDisplayName: string;
  responsibleWorkerName: string | null;
  occurredAtUtc: string;
  recordedAtUtc: string;
  componentIdentifier: string | null;
  installedCondition: string | null;
  removedCondition: string | null;
  reason: string | null;
  installationNotes: string | null;
  removalNotes: string | null;
  isActiveInstallation: boolean;
}

export interface CatalogLineEntry {
  id: string;
  name: string;
  isActive: boolean;
  plantId?: string;
}

export interface LineComponentEntry {
  id: string;
  name: string;
  isActive: boolean;
  productionLineId?: string;
  componentTypeId?: string;
}

export interface ComponentTypeEntry {
  id: string;
  code: string;
  nameEs: string;
  nameEn: string;
  isActive: boolean;
}

export interface RecordRastraComponentChangeInput {
  rastraId: string;
  changeType: "INSTALLATION" | "REMOVAL" | "REPLACEMENT";
  installationId: string;
  replacedInstallationId?: string;
  inventoryItemId?: string;
  unitId?: string;
  quantity?: number;
  occurredAtUtc: string;
  componentIdentifier?: string;
  installedCondition?: string;
  removedCondition?: string;
  reason?: string;
  installationNotes?: string;
  removalNotes?: string;
}

export interface OperationalNoveltyCategory {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface OperationalNovelty {
  organizationId: string;
  plantId: string;
  noveltyId: string;
  lineId: string | null;
  lineName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  description: string;
  openedByDisplayName: string;
  openingResponsibleWorkerName: string | null;
  openedAtUtc: string;
  closedByDisplayName: string | null;
  closedAtUtc: string | null;
  isOpen: boolean;
  durationMinutes: number | null;
}

export interface OpenOperationalNoveltyInput {
  lineId?: string;
  categoryId?: string;
  description: string;
  occurredAtUtc: string;
}

export function parseInventoryFilters(
  params: URLSearchParams,
): InventoryFilters {
  const viewValue = params.get("view");
  const view: InventoryView =
    viewValue === "kardex" ||
    viewValue === "reviews" ||
    viewValue === "components" ||
    viewValue === "novelties" ||
    viewValue === "catalog" ||
    viewValue === "actions"
      ? viewValue
      : "stock";
  return {
    view,
    plantId: optional(params.get("plant")),
    inventoryItemId: optional(params.get("item")),
    rastraId: optional(params.get("rastra")),
    search: params.get("search")?.trim() ?? "",
    page: positiveInteger(params.get("page"), 1, 10_000),
    differencesOnly: params.get("differences") === "true",
    reviewReminderDays: positiveInteger(params.get("reviewDays"), 30, 3650),
    replacementReminderDays: positiveInteger(
      params.get("replacementDays"),
      30,
      3650,
    ),
  };
}

export function useInventoryPlants() {
  return useInventoryQuery<PageCatalog>(
    ["inventory-plants"],
    "/plants?page=1&pageSize=100&state=active",
    true,
  );
}

export function useInventoryItemTypes(enabled: boolean) {
  return useInventoryQuery<Page<InventoryCatalogEntry>>(
    ["inventory-item-types"],
    "/inventory/item-types?page=1&pageSize=100&state=active",
    enabled,
  );
}

export function useInventoryUnits(enabled: boolean) {
  return useInventoryQuery<Page<InventoryCatalogEntry>>(
    ["inventory-units"],
    "/inventory/units?page=1&pageSize=100&state=active",
    enabled,
  );
}

export function useInventoryItems(plantId: string, enabled: boolean) {
  return useInventoryQuery<Page<InventoryCatalogEntry>>(
    ["inventory-items", plantId],
    `/inventory/plants/${encodeURIComponent(plantId)}/items?page=1&pageSize=100&state=active`,
    enabled && plantId.length > 0,
  );
}

export function useInventoryLines(plantId: string, enabled: boolean) {
  return useInventoryQuery<Page<CatalogLineEntry>>(
    ["inventory-lines", plantId],
    `/plants/${encodeURIComponent(plantId)}/lines?page=1&pageSize=100&state=active`,
    enabled && plantId.length > 0,
  );
}

export function useInventoryComponentTypes(enabled: boolean) {
  return useInventoryQuery<readonly ComponentTypeEntry[]>(
    ["inventory-component-types"],
    "/component-types",
    enabled,
  );
}

export function useInventoryLineComponents(lineId: string, enabled: boolean) {
  return useInventoryQuery<Page<LineComponentEntry>>(
    ["inventory-line-components", lineId],
    `/lines/${encodeURIComponent(lineId)}/components?page=1&pageSize=100&state=active`,
    enabled && lineId.length > 0,
  );
}

export function useInventoryActionStock(plantId: string, enabled: boolean) {
  return useInventoryQuery<Page<InventoryStock>>(
    ["inventory-action-stock", plantId],
    `/inventory/plants/${encodeURIComponent(plantId)}/stock?page=1&pageSize=100&state=active`,
    enabled && plantId.length > 0,
  );
}

export function useInventoryActionMovements(
  plantId: string,
  inventoryItemId: string,
  enabled: boolean,
) {
  const query = new URLSearchParams({
    page: "1",
    pageSize: "100",
    state: "all",
    direction: "desc",
    inventoryItemId,
  });
  return useInventoryQuery<Page<InventoryMovement>>(
    ["inventory-action-movements", plantId, inventoryItemId],
    `/inventory/plants/${encodeURIComponent(plantId)}/movements?${query}`,
    enabled && plantId.length > 0 && inventoryItemId.length > 0,
  );
}

export function useCreateInventoryItemType() {
  return useInventoryMutation<CreateInventoryItemTypeInput>(
    "/inventory/item-types",
    ["inventory-item-types"],
  );
}

export function useCreateInventoryUnit() {
  return useInventoryMutation<CreateInventoryUnitInput>("/inventory/units", [
    "inventory-units",
  ]);
}

export function useCreateInventoryItem(plantId: string) {
  return useInventoryMutation<CreateInventoryItemInput>(
    `/inventory/plants/${encodeURIComponent(plantId)}/items`,
    ["inventory-items", plantId],
  );
}

export function useRecordInventoryMovement(plantId: string) {
  return useInventoryActionMutation<RecordInventoryMovementInput>(
    `/inventory/plants/${encodeURIComponent(plantId)}/movements`,
  );
}

export function useRecordInventoryAdjustment(plantId: string) {
  return useInventoryActionMutation<RecordInventoryAdjustmentInput>(
    `/inventory/plants/${encodeURIComponent(plantId)}/adjustments`,
  );
}

export function useReverseInventoryMovement(plantId: string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  return useMutation({
    mutationFn: ({
      movementId,
      reason,
      occurredAtUtc,
    }: {
      movementId: string;
      reason: string;
      occurredAtUtc: string;
    }) =>
      apiRequest<InventoryMovement>(
        `/organizations/${encodeURIComponent(organizationId)}/inventory/plants/${encodeURIComponent(plantId)}/movements/${encodeURIComponent(movementId)}/reversal`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ reason, occurredAtUtc }),
        },
      ),
    onSuccess: async () => invalidateInventoryActions(queryClient),
  });
}

export function useRecordInventoryReview(plantId: string) {
  return useInventoryActionMutation<RecordInventoryReviewInput>(
    `/inventory/plants/${encodeURIComponent(plantId)}/reviews`,
  );
}

export function useInventoryStock(filters: InventoryFilters, plantId: string) {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: "10",
    state: "all",
  });
  if (filters.search.length > 0) query.set("search", filters.search);
  return useInventoryQuery<Page<InventoryStock>>(
    ["inventory-stock", plantId, query.toString()],
    `/inventory/plants/${encodeURIComponent(plantId)}/stock?${query}`,
    filters.view === "stock" && plantId.length > 0,
  );
}

export function useInventoryMovements(
  filters: InventoryFilters,
  plantId: string,
) {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: "10",
    state: "all",
    direction: "asc",
  });
  if (filters.inventoryItemId !== undefined)
    query.set("inventoryItemId", filters.inventoryItemId);
  return useInventoryQuery<Page<InventoryMovement>>(
    ["inventory-movements", plantId, query.toString()],
    `/inventory/plants/${encodeURIComponent(plantId)}/movements?${query}`,
    filters.view === "kardex" &&
      plantId.length > 0 &&
      filters.inventoryItemId !== undefined,
  );
}

export function useInventoryReviews(
  filters: InventoryFilters,
  plantId: string,
) {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: "10",
    state: "all",
    differencesOnly: String(filters.differencesOnly),
  });
  if (filters.inventoryItemId !== undefined)
    query.set("inventoryItemId", filters.inventoryItemId);
  if (filters.search.length > 0) query.set("search", filters.search);
  return useInventoryQuery<Page<InventoryReviewLine>>(
    ["inventory-reviews", plantId, query.toString()],
    `/inventory/plants/${encodeURIComponent(plantId)}/reviews?${query}`,
    filters.view === "reviews" && plantId.length > 0,
  );
}

export function useRastraComponentHistory(
  filters: InventoryFilters,
  plantId: string,
) {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: "10",
    state: "all",
    direction: "asc",
  });
  if (filters.rastraId !== undefined) query.set("rastraId", filters.rastraId);
  if (filters.search.length > 0) query.set("search", filters.search);
  return useInventoryQuery<Page<RastraComponentChange>>(
    ["inventory-components", plantId, query.toString()],
    `/inventory/plants/${encodeURIComponent(plantId)}/component-changes?${query}`,
    filters.view === "components" && plantId.length > 0,
  );
}

export function useRastraComponentOptions(
  plantId: string,
  rastraId: string,
  enabled: boolean,
) {
  const query = new URLSearchParams({
    page: "1",
    pageSize: "100",
    state: "all",
    direction: "desc",
    rastraId,
  });
  return useInventoryQuery<Page<RastraComponentChange>>(
    ["inventory-component-options", plantId, rastraId],
    `/inventory/plants/${encodeURIComponent(plantId)}/component-changes?${query}`,
    enabled && plantId.length > 0 && rastraId.length > 0,
  );
}

export function useRecordRastraComponentChange(plantId: string) {
  return useInventoryMaintenanceMutation<RecordRastraComponentChangeInput>(
    `/inventory/plants/${encodeURIComponent(plantId)}/component-changes`,
  );
}

export function useOperationalNoveltyCategories(enabled: boolean) {
  return useInventoryQuery<readonly OperationalNoveltyCategory[]>(
    ["inventory-novelty-categories"],
    "/inventory/novelty-categories",
    enabled,
  );
}

export function useOperationalNovelties(
  filters: InventoryFilters,
  plantId: string,
) {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: "20",
    state: "all",
  });
  if (filters.search.length > 0) query.set("search", filters.search);
  return useInventoryQuery<Page<OperationalNovelty>>(
    ["inventory-novelties", plantId, query.toString()],
    `/inventory/plants/${encodeURIComponent(plantId)}/novelties?${query}`,
    filters.view === "novelties" && plantId.length > 0,
  );
}

export function useOpenOperationalNovelty(plantId: string) {
  return useInventoryMaintenanceMutation<OpenOperationalNoveltyInput>(
    `/inventory/plants/${encodeURIComponent(plantId)}/novelties`,
  );
}

export function useCloseOperationalNovelty(plantId: string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  return useMutation({
    mutationFn: ({
      noveltyId,
      occurredAtUtc,
    }: {
      noveltyId: string;
      occurredAtUtc: string;
    }) =>
      apiRequest<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}/inventory/plants/${encodeURIComponent(plantId)}/novelties/${encodeURIComponent(noveltyId)}/closure`,
        token,
        { method: "POST", body: JSON.stringify({ occurredAtUtc }) },
      ),
    onSuccess: async () => invalidateInventoryMaintenance(queryClient),
  });
}

export function reminderDue(
  lastAtUtc: string | null,
  firstAtUtc: string | null,
  intervalDays: number,
  now = new Date(),
): boolean {
  const base = lastAtUtc ?? firstAtUtc;
  if (base === null) return false;
  return now.getTime() - Date.parse(base) >= intervalDays * 86_400_000;
}

function useInventoryQuery<T>(
  key: readonly unknown[],
  path: string,
  enabled: boolean,
) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  return useQuery({
    queryKey: [...key, profileId, organizationId],
    enabled: enabled && auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) =>
      apiRequest<T>(
        `/organizations/${encodeURIComponent(organizationId)}${path}`,
        token,
        { signal },
      ),
  });
}

function useInventoryMutation<TInput>(
  path: string,
  invalidationKey: readonly unknown[],
) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  return useMutation({
    mutationFn: (input: TInput) =>
      apiRequest<InventoryCatalogEntry>(
        `/organizations/${encodeURIComponent(organizationId)}${path}`,
        token,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invalidationKey });
    },
  });
}

function useInventoryActionMutation<TInput>(path: string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  return useMutation({
    mutationFn: (input: TInput) =>
      apiRequest<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}${path}`,
        token,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => invalidateInventoryActions(queryClient),
  });
}

function useInventoryMaintenanceMutation<TInput>(path: string) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  return useMutation({
    mutationFn: (input: TInput) =>
      apiRequest<unknown>(
        `/organizations/${encodeURIComponent(organizationId)}${path}`,
        token,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => invalidateInventoryMaintenance(queryClient),
  });
}

async function invalidateInventoryActions(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inventory-stock"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-action-stock"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-movements"] }),
    queryClient.invalidateQueries({
      queryKey: ["inventory-action-movements"],
    }),
    queryClient.invalidateQueries({ queryKey: ["inventory-reviews"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-assignments"] }),
    queryClient.invalidateQueries({ queryKey: ["management-freshness"] }),
  ]);
}

async function invalidateInventoryMaintenance(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inventory-components"] }),
    queryClient.invalidateQueries({
      queryKey: ["inventory-component-options"],
    }),
    queryClient.invalidateQueries({ queryKey: ["inventory-novelties"] }),
    queryClient.invalidateQueries({ queryKey: ["management-freshness"] }),
  ]);
}

function optional(value: string | null): string | undefined {
  return value === null || value.trim().length === 0 ? undefined : value;
}

function positiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value ?? "");
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}
