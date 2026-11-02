import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";

import { apiRequest } from "../../api/http";
import { cachePolicy } from "../../app/cache-policy";
import { scopedQueryKey } from "../../app/query-keys";
import { useAuth } from "../../auth/auth-context";

export type StatisticsPeriod =
  "current-month" | "previous-month" | "last-90-days" | "custom";
export type StatisticsBucket = "day" | "week" | "month";

export interface StatisticsFilters {
  period: StatisticsPeriod;
  fromDate: string;
  toDate: string;
  productionLineId?: string;
  supplierId?: string;
  comparePrevious: boolean;
}

export interface StatisticsMetrics {
  completedShipments: number;
  totalCajuelas: number;
  sweepCount: number;
  goldShipments: number;
  totalGoldGrams: number;
  includedCajuelas: number;
  gramsPerCajuela: number | null;
  goldCoveragePercentage: number;
  averageShipmentHours: number | null;
}

export interface StatisticsPoint extends StatisticsMetrics {
  bucketStart: string;
}

export interface StatisticsBreakdown extends StatisticsMetrics {
  id: string;
  name: string;
  displayOrder?: number;
}

export interface ManagementStatisticsResponse {
  generatedAtUtc: string;
  period: { fromUtc: string; toUtc: string; bucket: StatisticsBucket };
  summary: StatisticsMetrics;
  previousSummary: StatisticsMetrics | null;
  timeline: StatisticsPoint[];
  previousTimeline: StatisticsPoint[];
  productionLines: StatisticsBreakdown[];
  suppliers: StatisticsBreakdown[];
}

export type StatisticsQuery = UseQueryResult<
  ManagementStatisticsResponse,
  Error
>;

export function parseStatisticsFilters(
  parameters: URLSearchParams,
): StatisticsFilters {
  const requestedPeriod = parameters.get("period");
  const period: StatisticsPeriod =
    requestedPeriod === "previous-month" ||
    requestedPeriod === "last-90-days" ||
    requestedPeriod === "custom"
      ? requestedPeriod
      : "current-month";
  const today = todayInCostaRica();
  const requestedFrom = validDate(parameters.get("from")) ?? today;
  const requestedTo = validDate(parameters.get("to")) ?? requestedFrom;
  const [fromDate, toDate] =
    requestedFrom <= requestedTo
      ? [requestedFrom, requestedTo]
      : [requestedTo, requestedFrom];
  return {
    period,
    fromDate,
    toDate,
    productionLineId: optional(parameters.get("line")),
    supplierId: optional(parameters.get("supplier")),
    comparePrevious: parameters.get("compare") !== "false",
  };
}

export function useManagementStatistics(
  filters: StatisticsFilters,
): StatisticsQuery {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  const query = statisticsQuery(filters);

  return useQuery({
    queryKey: scopedQueryKey(
      "management-statistics",
      profileId,
      organizationId,
      query,
    ),
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) =>
      apiRequest<ManagementStatisticsResponse>(
        `/organizations/${encodeURIComponent(organizationId)}/management/statistics?${query}`,
        token,
        { signal },
      ),
    placeholderData: keepPreviousData,
    ...cachePolicy.history,
  });
}

export function statisticsDateRange(
  filters: StatisticsFilters,
  now = new Date(),
): { fromDate: string; toDate: string; fromUtc: string; toUtc: string } {
  let fromDate: string;
  let toDate: string;
  if (filters.period === "custom") {
    fromDate = filters.fromDate;
    toDate = filters.toDate;
  } else {
    const today = costaRicaCalendarDate(now);
    const current = new Date(Date.UTC(today.year, today.month - 1, today.day));
    if (filters.period === "last-90-days") {
      const start = new Date(current);
      start.setUTCDate(start.getUTCDate() - 89);
      fromDate = calendarDate(start);
      toDate = calendarDate(current);
    } else {
      const monthOffset = filters.period === "previous-month" ? -1 : 0;
      const start = new Date(
        Date.UTC(today.year, today.month - 1 + monthOffset, 1),
      );
      const end =
        filters.period === "previous-month"
          ? new Date(Date.UTC(today.year, today.month - 1, 0))
          : current;
      fromDate = calendarDate(start);
      toDate = calendarDate(end);
    }
  }
  const exclusiveEnd = parseCalendarDate(toDate);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  return {
    fromDate,
    toDate,
    fromUtc: `${fromDate}T06:00:00.000Z`,
    toUtc: `${calendarDate(exclusiveEnd)}T06:00:00.000Z`,
  };
}

function statisticsQuery(filters: StatisticsFilters): string {
  const range = statisticsDateRange(filters);
  const days = Math.max(
    1,
    Math.round(
      (Date.parse(range.toUtc) - Date.parse(range.fromUtc)) / 86_400_000,
    ),
  );
  const bucket: StatisticsBucket =
    days <= 45 ? "day" : days <= 180 ? "week" : "month";
  const parameters = new URLSearchParams({
    fromUtc: range.fromUtc,
    toUtc: range.toUtc,
    bucket,
    comparePrevious: String(filters.comparePrevious),
  });
  if (filters.productionLineId !== undefined)
    parameters.set("productionLineId", filters.productionLineId);
  if (filters.supplierId !== undefined)
    parameters.set("supplierId", filters.supplierId);
  return parameters.toString();
}

function todayInCostaRica(): string {
  const value = costaRicaCalendarDate(new Date());
  return `${value.year}-${pad(value.month)}-${pad(value.day)}`;
}

function costaRicaCalendarDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Costa_Rica",
    year: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function calendarDate(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function validDate(value: string | null): string | undefined {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? value
    : undefined;
}

function optional(value: string | null): string | undefined {
  return value === null || value.length === 0 ? undefined : value;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
