import {
  keepPreviousData,
  useQueries,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";

import type {
  ManagementShipment,
  PageCatalog,
  PageManagementShipment,
  PageManagementSweepMercury,
  PageWorker,
} from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { cachePolicy } from "../../app/cache-policy";
import { scopedQueryKey } from "../../app/query-keys";
import { useAuth } from "../../auth/auth-context";
import type { Language } from "../../i18n/language-context";
import type {
  AuditFilterSource,
  AuditGroupKey,
  ShipmentSort,
} from "./management-audit-filters";

export type ShipmentPeriod = "current" | "previous" | "date" | "all";

export interface ShipmentFilters {
  period: ShipmentPeriod;
  date: string;
  toDate: string;
  shipmentReference: string;
  shipmentId?: string;
  /** Código corto o UUID completo; el servidor busca la coincidencia. */
  shipmentCode?: string;
  productionLineId?: string;
  supplierId?: string;
  responsibleWorkerId?: string;
  sort?: ShipmentSort;
  goldResult?: "recorded" | "pending";
  page: number;
}

export interface AuditEvent {
  id: string;
  actorDisplayName: string | null;
  actorRoleCode?: string | null;
  origin?: "API" | "WEB" | "DESKTOP" | "SYNC" | "SYSTEM";
  action: string;
  entityType: string;
  entityId: string | null;
  shipmentStatus?: "ACTIVE" | "COMPLETED" | null;
  auditArea?: AuditGroupKey | null;
  auditKind?: string;
  subjectWorkerId?: string | null;
  subjectName?: string | null;
  subjectOccurredAtUtc?: string | null;
  productionLineId?: string | null;
  result: "SUCCEEDED" | "REJECTED" | "FAILED";
  reasonCode: string | null;
  changedFields?: string[];
  changes?: Record<string, { before: unknown; after: unknown }>;
  occurredAt: string;
  recordedAt: string;
}

export interface AuditFilters {
  search: string;
  category?: AuditGroupKey;
  kinds?: string;
  workerId?: string;
  productionLineId?: string;
  action?: string;
  entityType?: string;
  fromDate?: string;
  toDate?: string;
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ShipmentListQuery = UseQueryResult<PageManagementShipment, Error>;

const costaRicaDateParts = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Costa_Rica",
});

export function parseShipmentFilters(params: URLSearchParams): ShipmentFilters {
  const periodValue = params.get("period");
  const period: ShipmentPeriod =
    periodValue === "previous" ||
    periodValue === "date" ||
    periodValue === "all"
      ? periodValue
      : "current";
  const pageValue = Number(params.get("page") ?? "1");
  const requestedFromDate = validDate(params.get("date")) ?? todayInCostaRica();
  const requestedToDate = validDate(params.get("to")) ?? requestedFromDate;
  const [date, toDate] =
    requestedFromDate <= requestedToDate
      ? [requestedFromDate, requestedToDate]
      : [requestedToDate, requestedFromDate];

  return {
    period,
    date,
    toDate,
    shipmentReference: params.get("shipment")?.trim() ?? "",
    productionLineId: optional(params.get("line")),
    supplierId: optional(params.get("supplier")),
    responsibleWorkerId: optional(params.get("responsible")),
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
}

export function useManagementShipments(
  filters: ShipmentFilters,
  options: { enabled?: boolean } = {},
): ShipmentListQuery {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  const query = shipmentQuery(filters, 10);

  return useQuery({
    queryKey: scopedQueryKey(
      "management-shipments",
      profileId,
      organizationId,
      query,
    ),
    enabled:
      auth.session !== null &&
      auth.profile !== null &&
      options.enabled !== false,
    queryFn: ({ signal }) =>
      apiRequest<PageManagementShipment>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments?${query}`,
        token,
        { signal },
      ),
    placeholderData: keepPreviousData,
    ...cachePolicy.history,
  });
}

export function useManagementShipmentFilterOptions(
  filters: ShipmentFilters,
): ShipmentListQuery {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  const optionFilters: ShipmentFilters = {
    period: filters.period,
    date: filters.date,
    toDate: filters.toDate,
    shipmentReference: "",
    page: 1,
  };
  const query = shipmentQuery(optionFilters, 100);

  return useQuery({
    queryKey: scopedQueryKey(
      "management-shipment-filter-options",
      profileId,
      organizationId,
      query,
    ),
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) =>
      apiRequest<PageManagementShipment>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments?${query}`,
        token,
        { signal },
      ),
    ...cachePolicy.history,
  });
}

export function useRecentManagementShipments(): ShipmentListQuery {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: scopedQueryKey(
      "management-shipments-audit",
      profileId,
      organizationId,
    ),
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) =>
      apiRequest<PageManagementShipment>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments?page=1&pageSize=100`,
        token,
        { signal },
      ),
    ...cachePolicy.history,
  });
}

export function useManagementShipment(shipmentId: string) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: scopedQueryKey(
      "management-shipment",
      profileId,
      organizationId,
      shipmentId,
    ),
    enabled:
      auth.session !== null && auth.profile !== null && shipmentId.length > 0,
    queryFn: ({ signal }) =>
      apiRequest<ManagementShipment>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments/${encodeURIComponent(shipmentId)}`,
        token,
        { signal },
      ),
    ...cachePolicy.history,
  });
}

export function useManagementShipmentSweeps(shipmentId: string) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: scopedQueryKey(
      "management-shipment-sweeps",
      profileId,
      organizationId,
      shipmentId,
    ),
    enabled:
      auth.session !== null && auth.profile !== null && shipmentId.length > 0,
    queryFn: ({ signal }) =>
      apiRequest<PageManagementSweepMercury>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments/${encodeURIComponent(shipmentId)}/sweeps?page=1&pageSize=100`,
        token,
        { signal },
      ),
    ...cachePolicy.history,
  });
}

export function useShipmentAuditEvents(filters?: AuditFilters) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  const params = new URLSearchParams({
    page: String(filters?.page ?? 1),
    pageSize: String(filters?.pageSize ?? 100),
    routine: "exclude",
    inventory: "exclude",
  });
  const search = filters?.search.trim() ?? "shipment";
  if (search.length > 0) params.set("search", search);
  if (filters?.category !== undefined) params.set("category", filters.category);
  if (filters?.kinds !== undefined) params.set("kinds", filters.kinds);
  if (filters?.workerId !== undefined) params.set("workerId", filters.workerId);
  if (filters?.productionLineId !== undefined)
    params.set("productionLineId", filters.productionLineId);
  if (filters?.action !== undefined) params.set("action", filters.action);
  if (filters?.entityType !== undefined)
    params.set("entityType", filters.entityType);
  if (filters?.fromDate !== undefined)
    params.set("fromUtc", `${filters.fromDate}T06:00:00.000Z`);
  if (filters?.toDate !== undefined) {
    const parsed = parseDate(filters.toDate);
    const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
    next.setUTCDate(next.getUTCDate() + 1);
    params.set("toUtc", `${calendarDate(next)}T06:00:00.000Z`);
  }
  const query = params.toString();

  return useQuery({
    queryKey: scopedQueryKey(
      "shipment-audit",
      profileId,
      organizationId,
      query,
    ),
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) =>
      apiRequest<Page<AuditEvent>>(
        `/organizations/${encodeURIComponent(organizationId)}/audit-events?${query}`,
        token,
        { signal },
      ),
    placeholderData: keepPreviousData,
    ...cachePolicy.history,
  });
}

export function shipmentDateRange(
  filters: ShipmentFilters,
  now = new Date(),
): { fromUtc?: string; toUtc?: string } {
  if (filters.period === "all") return {};
  if (filters.period === "date")
    return costaRicaDateRange(filters.date, filters.toDate);

  const today = costaRicaCalendarDate(now);
  const calendar = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const daysSinceMonday = (calendar.getUTCDay() + 6) % 7;
  calendar.setUTCDate(
    calendar.getUTCDate() -
      daysSinceMonday -
      (filters.period === "previous" ? 7 : 0),
  );
  const start = calendarDate(calendar);
  const endCalendar = new Date(calendar);
  endCalendar.setUTCDate(endCalendar.getUTCDate() + 7);
  return range(start, calendarDate(endCalendar));
}

export function formatCostaRicaDateTime(
  value: string,
  language: Language = "es",
): string {
  return new Intl.DateTimeFormat(language === "es" ? "es-CR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(new Date(value));
}

/**
 * Código corto del cargamento: los primeros 8 caracteres de su UUID en
 * mayúsculas. Es el mismo en desktop, API, web, auditoría y reportes; el UUID
 * sigue siendo el identificador para navegar y consultar.
 */
export function shortShipmentId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}

const shipmentCodePattern =
  /^(?:[0-9a-f]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;

/**
 * Normaliza lo que se pega en la búsqueda: quita espacios al inicio y al final
 * e ignora mayúsculas. Devuelve undefined si no es un código corto ni un UUID.
 */
export function normalizeShipmentCode(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return shipmentCodePattern.test(normalized) ? normalized : undefined;
}

function shipmentQuery(filters: ShipmentFilters, pageSize: number): string {
  const dates = shipmentDateRange(filters);
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(pageSize),
  });
  if (dates.fromUtc !== undefined) params.set("fromUtc", dates.fromUtc);
  if (dates.toUtc !== undefined) params.set("toUtc", dates.toUtc);
  if (filters.productionLineId !== undefined)
    params.set("productionLineId", filters.productionLineId);
  if (filters.supplierId !== undefined)
    params.set("supplierId", filters.supplierId);
  if (filters.responsibleWorkerId !== undefined)
    params.set("responsibleWorkerId", filters.responsibleWorkerId);
  if (filters.shipmentId !== undefined)
    params.set("shipmentId", filters.shipmentId);
  if (filters.shipmentCode !== undefined)
    params.set("shipmentCode", filters.shipmentCode);
  if (filters.sort !== undefined && filters.sort !== "recent")
    params.set("sort", filters.sort);
  if (filters.goldResult !== undefined)
    params.set("goldResult", filters.goldResult);
  return params.toString();
}

function costaRicaDateRange(
  fromDate: string,
  toDate: string,
): { fromUtc: string; toUtc: string } {
  const parsed = parseDate(toDate);
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  next.setUTCDate(next.getUTCDate() + 1);
  return range(fromDate, calendarDate(next));
}

function range(from: string, to: string): { fromUtc: string; toUtc: string } {
  return {
    fromUtc: `${from}T06:00:00.000Z`,
    toUtc: `${to}T06:00:00.000Z`,
  };
}

function todayInCostaRica(): string {
  const value = costaRicaCalendarDate(new Date());
  return `${value.year}-${pad(value.month)}-${pad(value.day)}`;
}

function costaRicaCalendarDate(value: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = costaRicaDateParts.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function parseDate(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = value.split("-").map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

function calendarDate(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function validDate(value: string | null): string | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const parsed = parseDate(value);
  const roundTrip = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day),
  );
  return calendarDate(roundTrip) === value ? value : null;
}

function optional(value: string | null): string | undefined {
  return value === null || value.trim().length === 0 ? undefined : value;
}

export interface AuditCatalogOption {
  id: string;
  name: string;
  isActive: boolean;
}

export interface AuditCatalogResult {
  options: AuditCatalogOption[];
  isPending: boolean;
  isError: boolean;
}

/**
 * Valores del segundo selector cuando dependen de un catálogo. Solo consulta el
 * catálogo que el filtro elegido necesita; incluye registros inactivos para
 * poder auditar historia de líneas, proveedores o personas desactivadas.
 */
export function useAuditFilterCatalog(
  source: AuditFilterSource | undefined,
): AuditCatalogResult {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  const ready = auth.session !== null && auth.profile !== null;
  const base = `/organizations/${encodeURIComponent(organizationId)}`;

  const plants = useQuery({
    queryKey: scopedQueryKey("audit-filter-plants", profileId, organizationId),
    enabled: ready && source === "line",
    queryFn: ({ signal }) =>
      apiRequest<PageCatalog>(
        `${base}/plants?page=1&pageSize=100&state=all`,
        token,
        { signal },
      ),
    ...cachePolicy.catalog,
  });
  const lines = useQueries({
    queries: (source === "line" ? (plants.data?.items ?? []) : []).map(
      (plant) => ({
        queryKey: scopedQueryKey(
          "audit-filter-lines",
          profileId,
          organizationId,
          plant.id,
        ),
        enabled: ready,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          apiRequest<PageCatalog>(
            `${base}/plants/${encodeURIComponent(plant.id)}/lines?page=1&pageSize=100&state=all`,
            token,
            { signal },
          ),
        ...cachePolicy.catalog,
      }),
    ),
  });
  const suppliers = useQuery({
    queryKey: scopedQueryKey(
      "audit-filter-suppliers",
      profileId,
      organizationId,
    ),
    enabled: ready && source === "supplier",
    queryFn: ({ signal }) =>
      apiRequest<PageCatalog>(
        `${base}/suppliers?page=1&pageSize=100&state=all`,
        token,
        { signal },
      ),
    ...cachePolicy.catalog,
  });
  const workers = useQuery({
    queryKey: scopedQueryKey("audit-filter-workers", profileId, organizationId),
    enabled: ready && source === "person",
    queryFn: ({ signal }) =>
      apiRequest<PageWorker>(
        `${base}/workers?page=1&pageSize=100&state=all`,
        token,
        { signal },
      ),
    ...cachePolicy.catalog,
  });

  if (source === "line")
    return {
      options: sortOptions(
        lines.flatMap((query) =>
          (query.data?.items ?? []).map((line) => ({
            id: line.id,
            name: line.name,
            isActive: line.isActive,
          })),
        ),
      ),
      isPending: plants.isPending || lines.some((query) => query.isPending),
      isError: plants.isError || lines.some((query) => query.isError),
    };
  if (source === "supplier")
    return {
      options: sortOptions(
        (suppliers.data?.items ?? []).map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          isActive: supplier.isActive,
        })),
      ),
      isPending: suppliers.isPending,
      isError: suppliers.isError,
    };
  if (source === "person")
    return {
      options: sortOptions(
        (workers.data?.items ?? []).map((worker) => ({
          id: worker.id,
          name: worker.name,
          isActive: worker.isActive,
        })),
      ),
      isPending: workers.isPending,
      isError: workers.isError,
    };
  return { options: [], isPending: false, isError: false };
}

function sortOptions(options: AuditCatalogOption[]): AuditCatalogOption[] {
  return [...options].sort(
    (left, right) =>
      Number(right.isActive) - Number(left.isActive) ||
      left.name.localeCompare(right.name, "es"),
  );
}
