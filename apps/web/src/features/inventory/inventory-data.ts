import { useQuery } from "@tanstack/react-query";

import type { PageCatalog } from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { useAuth } from "../../auth/auth-context";

export type InventoryView = "stock" | "kardex" | "reviews" | "components";

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
  movementType:
    "ENTRY" | "EXIT" | "CONSUMPTION" | "RETURN" | "ADJUSTMENT" | "REVERSAL";
  quantityDelta: number;
  occurredAtUtc: string;
  recordedAtUtc: string;
  reason: string | null;
  destination: string | null;
  notes: string | null;
  relatedMovementId: string | null;
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

export function parseInventoryFilters(
  params: URLSearchParams,
): InventoryFilters {
  const viewValue = params.get("view");
  const view: InventoryView =
    viewValue === "kardex" ||
    viewValue === "reviews" ||
    viewValue === "components"
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
