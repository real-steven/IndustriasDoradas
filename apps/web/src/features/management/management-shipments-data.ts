import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type {
  ManagementShipment,
  PageManagementShipment,
  PageManagementSweepMercury,
} from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { useAuth } from "../../auth/auth-context";
import type { Language } from "../../i18n/language-context";

export type ShipmentPeriod = "current" | "previous" | "date" | "all";

export interface ShipmentFilters {
  period: ShipmentPeriod;
  date: string;
  toDate: string;
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
  result: "SUCCEEDED" | "REJECTED" | "FAILED";
  reasonCode: string | null;
  changedFields?: string[];
  changes?: Record<string, { before: unknown; after: unknown }>;
  occurredAt: string;
  recordedAt: string;
}

export interface AuditFilters {
  search: string;
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
    queryKey: ["management-shipments", profileId, organizationId, query],
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: () =>
      apiRequest<PageManagementShipment>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments?${query}`,
        token,
      ),
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
    page: 1,
  };
  const query = shipmentQuery(optionFilters, 100);

  return useQuery({
    queryKey: [
      "management-shipment-filter-options",
      profileId,
      organizationId,
      query,
    ],
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: () =>
      apiRequest<PageManagementShipment>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments?${query}`,
        token,
      ),
  });
}

export function useRecentManagementShipments(): ShipmentListQuery {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: ["management-shipments-audit", profileId, organizationId],
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: () =>
      apiRequest<PageManagementShipment>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments?page=1&pageSize=100`,
        token,
      ),
  });
}

export function useManagementShipment(shipmentId: string) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: ["management-shipment", profileId, organizationId, shipmentId],
    enabled:
      auth.session !== null && auth.profile !== null && shipmentId.length > 0,
    queryFn: () =>
      apiRequest<ManagementShipment>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments/${encodeURIComponent(shipmentId)}`,
        token,
      ),
  });
}

export function useManagementShipmentSweeps(shipmentId: string) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: [
      "management-shipment-sweeps",
      profileId,
      organizationId,
      shipmentId,
    ],
    enabled:
      auth.session !== null && auth.profile !== null && shipmentId.length > 0,
    queryFn: () =>
      apiRequest<PageManagementSweepMercury>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments/${encodeURIComponent(shipmentId)}/sweeps?page=1&pageSize=100`,
        token,
      ),
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
  });
  const search = filters?.search.trim() ?? "shipment";
  if (search.length > 0) params.set("search", search);
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
    queryKey: ["shipment-audit", profileId, organizationId, query],
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: () =>
      apiRequest<Page<AuditEvent>>(
        `/organizations/${encodeURIComponent(organizationId)}/audit-events?${query}`,
        token,
      ),
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
