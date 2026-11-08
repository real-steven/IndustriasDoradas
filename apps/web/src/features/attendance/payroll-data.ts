import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiDownload, apiRequest } from "../../api/http";
import { cachePolicy } from "../../app/cache-policy";
import { scopedQueryKey } from "../../app/query-keys";
import { useAuth } from "../../auth/auth-context";

export type PayrollAdjustmentType =
  | "PAID_LEAVE_HOURS"
  | "OVERTIME_HOURS"
  | "HOLIDAY_HOURS"
  | "REST_DAY_HOURS"
  | "ABSENCE_HOURS"
  | "EARLY_DEPARTURE_HOURS"
  | "OTHER_COMMENT"
  | "OTHER_EARNING"
  | "OTHER_DEDUCTION";

export interface PayrollWorkerProfile {
  id: string;
  organizationId: string;
  plantId: string;
  name: string;
  identityNumber: string | null;
  category: string;
  status: string;
  isActive: boolean;
  currentRateId: string | null;
  currentHourlyRateCrc: number | null;
  nightMultiplier: number | null;
  rateEffectiveFromUtc: string | null;
}

export interface PayrollRateVersion {
  id: string;
  regularHourlyRateCrc: number;
  nightMultiplier: number;
  effectiveFromUtc: string;
  reason: string;
  createdAtUtc: string;
}

export interface PayrollAdjustment {
  id: string;
  adjustmentDate: string;
  adjustmentType: PayrollAdjustmentType;
  minutes: number | null;
  amountCrc: number | null;
  note: string;
  recordedAtUtc: string;
  calculatedAmountCrc: number | null;
}

export interface PayrollGrossAuthorization {
  id: string;
  fromDate: string;
  toDate: string;
  authorizedAmountCrc: number;
  reason: string;
  recordedByName: string;
  recordedAtUtc: string;
}

export interface PayrollShift {
  status: "COMPLETED" | "OPEN";
  startedOn: string;
  checkInAtUtc: string;
  checkOutAtUtc: string | null;
  minutesInPeriod: number | null;
}

export interface PayrollWorkerResult {
  worker: PayrollWorkerProfile;
  confirmedMinutes: number;
  completedShiftCount: number;
  openShiftCount: number;
  incidentCount: number;
  baseAmountCrc: number | null;
  adjustmentAmountCrc: number | null;
  calculatedGrossAmountCrc: number | null;
  authorizedGrossAmountCrc: number | null;
  grossDifferenceCrc: number | null;
  estimatedGrossAmountCrc: number | null;
  missingRateMinutes: number;
  grossAuthorization: PayrollGrossAuthorization | null;
  grossAuthorizations: PayrollGrossAuthorization[];
  adjustments: PayrollAdjustment[];
  rates: PayrollRateVersion[];
  shifts: PayrollShift[];
}

export interface PayrollReport {
  version: "payroll-preparation-v1";
  timezone: "America/Costa_Rica";
  currencyCode: "CRC";
  legalScope: "GROSS_ESTIMATE_WITHOUT_LEGAL_DEDUCTIONS";
  period: { fromDate: string; toDate: string };
  generatedAtUtc: string;
  workers: PayrollWorkerResult[];
  summary: {
    workerCount: number;
    workersReady: number;
    workersMissingRate: number;
    confirmedMinutes: number;
    estimatedGrossAmountCrc: number | null;
  };
}

export interface PayrollFilters {
  fromDate: string;
  toDate: string;
  workerId?: string;
}

export function usePayrollWorkers(search = "") {
  const request = usePayrollRequest();
  const query = new URLSearchParams();
  if (search.trim() !== "") query.set("search", search.trim());
  return useQuery({
    queryKey: scopedQueryKey(
      "payroll-workers",
      request.profileId,
      request.organizationId,
      query.toString(),
    ),
    enabled: request.enabled,
    queryFn: ({ signal }) =>
      apiRequest<PayrollWorkerProfile[]>(
        `/organizations/${encodeURIComponent(request.organizationId)}/management/attendance/payroll/workers?${query}`,
        request.token,
        { signal },
      ),
    ...cachePolicy.personnel,
  });
}

export function usePayrollReport(filters: PayrollFilters) {
  const request = usePayrollRequest();
  const query = payrollQuery(filters);
  return useQuery({
    queryKey: scopedQueryKey(
      "payroll-report",
      request.profileId,
      request.organizationId,
      query,
    ),
    enabled: request.enabled,
    queryFn: ({ signal }) =>
      apiRequest<PayrollReport>(
        `/organizations/${encodeURIComponent(request.organizationId)}/management/attendance/payroll?${query}`,
        request.token,
        { signal },
      ),
    placeholderData: keepPreviousData,
    ...cachePolicy.live,
  });
}

export function useUpdatePayrollIdentity() {
  const request = usePayrollRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { workerId: string; identityNumber: string | null }) =>
      apiRequest<PayrollWorkerProfile>(
        `/organizations/${encodeURIComponent(request.organizationId)}/management/attendance/payroll/workers/${encodeURIComponent(input.workerId)}/profile`,
        request.token,
        {
          method: "PATCH",
          body: JSON.stringify({ identityNumber: input.identityNumber }),
        },
      ),
    onSuccess: () => invalidatePayroll(queryClient, request),
  });
}

export function useCreatePayrollRate() {
  const request = usePayrollRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workerId: string;
      regularHourlyRateCrc: number;
      effectiveFromUtc?: string;
      reason: string;
    }) =>
      apiRequest<PayrollRateVersion[]>(
        `/organizations/${encodeURIComponent(request.organizationId)}/management/attendance/payroll/workers/${encodeURIComponent(input.workerId)}/pay-rates`,
        request.token,
        {
          method: "POST",
          body: JSON.stringify({
            regularHourlyRateCrc: input.regularHourlyRateCrc,
            effectiveFromUtc: input.effectiveFromUtc,
            reason: input.reason,
          }),
        },
      ),
    onSuccess: () => invalidatePayroll(queryClient, request),
  });
}

export function useCreatePayrollAdjustment() {
  const request = usePayrollRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workerId: string;
      adjustmentDate: string;
      adjustmentType: PayrollAdjustmentType;
      minutes?: number;
      amountCrc?: number;
      note: string;
    }) => {
      const { workerId, ...body } = input;
      return apiRequest<PayrollAdjustment>(
        `/organizations/${encodeURIComponent(request.organizationId)}/management/attendance/payroll/workers/${encodeURIComponent(workerId)}/adjustments`,
        request.token,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    onSuccess: () => invalidatePayroll(queryClient, request),
  });
}

export function useAuthorizePayrollGross() {
  const request = usePayrollRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workerId: string;
      fromDate: string;
      toDate: string;
      authorizedAmountCrc: number;
      reason: string;
    }) => {
      const { workerId, ...body } = input;
      return apiRequest<PayrollGrossAuthorization>(
        `/organizations/${encodeURIComponent(request.organizationId)}/management/attendance/payroll/workers/${encodeURIComponent(workerId)}/gross-authorizations`,
        request.token,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    onSuccess: () => invalidatePayroll(queryClient, request),
  });
}

export function currentPayrollWeek(now = new Date()): {
  fromDate: string;
  toDate: string;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Costa_Rica",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const fromDate = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { fromDate, toDate: date.toISOString().slice(0, 10) };
}

export async function downloadPayrollReport(
  organizationId: string,
  accessToken: string,
  filters: PayrollFilters,
  format: "xlsx" | "pdf",
): Promise<void> {
  const result = await apiDownload(
    `/organizations/${encodeURIComponent(organizationId)}/reports/payroll.${format}?${payrollQuery(filters)}`,
    accessToken,
  );
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    result.filename ??
    `pre-nomina_${filters.fromDate}_${filters.toDate}.${format}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function payrollQuery(filters: PayrollFilters): string {
  const query = new URLSearchParams({
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  });
  if (filters.workerId !== undefined) query.set("workerId", filters.workerId);
  return query.toString();
}

function usePayrollRequest() {
  const auth = useAuth();
  return {
    token: auth.session?.access_token ?? "",
    organizationId: auth.profile?.organizationId ?? "",
    profileId: auth.profile?.profileId ?? "",
    enabled: auth.session !== null && auth.profile !== null,
  };
}

function invalidatePayroll(
  queryClient: ReturnType<typeof useQueryClient>,
  request: ReturnType<typeof usePayrollRequest>,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: scopedQueryKey(
        "payroll-workers",
        request.profileId,
        request.organizationId,
      ),
    }),
    queryClient.invalidateQueries({
      queryKey: scopedQueryKey(
        "payroll-report",
        request.profileId,
        request.organizationId,
      ),
    }),
  ]);
}
