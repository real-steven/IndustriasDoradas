import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";

import type {
  ManagementShipment,
  PageManagementShipment,
  PageManagementSweepMercury,
} from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { cachePolicy } from "../../app/cache-policy";
import { scopedQueryKey } from "../../app/query-keys";
import { useAuth } from "../../auth/auth-context";
import type { Language } from "../../i18n/language-context";

export type ShipmentPeriod = "current" | "previous" | "date" | "all";

export interface ShipmentFilters {
  period: ShipmentPeriod;
  date: string;
  toDate: string;
  shipmentReference: string;
  shipmentId?: string;
  productionLineId?: string;
  supplierId?: string;
  responsibleWorkerId?: string;
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
  result: "SUCCEEDED" | "REJECTED" | "FAILED";
  reasonCode: string | null;
  changedFields?: string[];
  changes?: Record<string, { before: unknown; after: unknown }>;
  occurredAt: string;
  recordedAt: string;
}

export interface AuditFilters {
  search: string;
  category?: "operation" | "people" | "administration";
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
    enabled: auth.session !== null && auth.profile !== null,
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

export function shortShipmentId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}

export function resolveShipmentReference(
  reference: string,
  items: ManagementShipment[],
): string | undefined {
  const requested = reference.trim();
  if (requested.length === 0) return undefined;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      requested,
    )
  )
    return requested;

  const normalized = requested.replaceAll("-", "").toLowerCase();
  const matches = items.filter((item) =>
    item.shipmentId.replaceAll("-", "").toLowerCase().startsWith(normalized),
  );
  return matches.length === 1
    ? matches[0]?.shipmentId
    : "00000000-0000-4000-8000-000000000000";
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
