import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type {
  AttendanceHours,
  PageWorker,
} from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { useAuth } from "../../auth/auth-context";
import type { Language } from "../../i18n/language-context";

export type AttendancePeriod = "current" | "previous" | "date";

export interface AttendanceFilters {
  period: AttendancePeriod;
  date: string;
  workerId?: string;
}

export type AttendanceHoursQuery = UseQueryResult<AttendanceHours, Error>;
export type AttendanceWorkersQuery = UseQueryResult<PageWorker, Error>;

const costaRicaDateParts = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Costa_Rica",
});

export function parseAttendanceFilters(
  params: URLSearchParams,
): AttendanceFilters {
  const candidate = params.get("period");
  const period: AttendancePeriod =
    candidate === "previous" || candidate === "date" ? candidate : "current";
  return {
    period,
    date: validDate(params.get("date")) ?? todayInCostaRica(),
    workerId: optional(params.get("worker")),
  };
}

export function attendanceDateRange(
  filters: AttendanceFilters,
  now = new Date(),
): { fromDate: string; toDate: string } {
  if (filters.period === "date") {
    return { fromDate: filters.date, toDate: filters.date };
  }

  const today = costaRicaCalendarDate(now);
  const calendar = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const daysSinceMonday = (calendar.getUTCDay() + 6) % 7;
  calendar.setUTCDate(
    calendar.getUTCDate() -
      daysSinceMonday -
      (filters.period === "previous" ? 7 : 0),
  );
  const fromDate = calendarDate(calendar);
  calendar.setUTCDate(calendar.getUTCDate() + 6);
  return { fromDate, toDate: calendarDate(calendar) };
}

export function useAttendanceHours(
  filters: AttendanceFilters,
): AttendanceHoursQuery {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  const range = attendanceDateRange(filters);
  const parameters = new URLSearchParams(range);
  if (filters.workerId !== undefined)
    parameters.set("workerId", filters.workerId);

  return useQuery({
    queryKey: [
      "attendance-hours",
      profileId,
      organizationId,
      parameters.toString(),
    ],
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) =>
      apiRequest<AttendanceHours>(
        `/organizations/${encodeURIComponent(organizationId)}/management/attendance/hours?${parameters}`,
        token,
        { signal },
      ),
  });
}

export function useAttendanceWorkers(): AttendanceWorkersQuery {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: ["attendance-workers", profileId, organizationId],
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) =>
      apiRequest<PageWorker>(
        `/organizations/${encodeURIComponent(organizationId)}/workers?page=1&pageSize=100&state=all`,
        token,
        { signal },
      ),
  });
}

export function formatMinutes(value: number, language: Language): string {
  const wholeMinutes = Math.round(value);
  const hours = Math.floor(wholeMinutes / 60);
  const minutes = wholeMinutes % 60;
  if (hours === 0)
    return language === "es" ? `${minutes} min` : `${minutes} min`;
  if (minutes === 0) return language === "es" ? `${hours} h` : `${hours} hr`;
  return language === "es"
    ? `${hours} h ${minutes} min`
    : `${hours} hr ${minutes} min`;
}

export function formatAttendanceDateTime(
  value: string,
  language: Language,
): string {
  return new Intl.DateTimeFormat(language === "es" ? "es-CR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(new Date(value));
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

function validDate(value: string | null): string | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return calendarDate(parsed) === value ? value : null;
}

function calendarDate(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function optional(value: string | null): string | undefined {
  return value === null || value.trim().length === 0 ? undefined : value;
}
