import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/http";
import { cachePolicy } from "../../app/cache-policy";
import { scopedQueryKey } from "../../app/query-keys";
import { useAuth } from "../../auth/auth-context";

export type ReportSettlementStatus =
  "DRAFT" | "REVIEWED" | "APPROVED" | "CLOSED";
export type ReportExpenseCategory =
  "TRANSPORT" | "BAGS" | "PLANT" | "SALARY" | "FINCA" | "OTHER";

export interface ReportSettlementLine {
  id: string;
  shipmentId: string;
  assayLabel: string | null;
  karat: number;
  gramsLiquidated: number;
  pricePerKaratCrc: number | null;
  pricePerGramCrc: number;
  grossAmountCrc: number;
  displayOrder: number;
}

export interface ReportSettlementExpense {
  id: string;
  category: ReportExpenseCategory;
  concept: string;
  amountCrc: number;
  occurredOn: string;
  responsibleName: string | null;
  displayOrder: number;
}

export interface ReportSettlement {
  id: string;
  supplierId: string;
  supplierName: string;
  weekStart: string;
  buyerName: string;
  destination: string | null;
  currencyCode: "CRC";
  participationPercentage: number;
  receivedAmountCrc: number | null;
  notes: string | null;
  status: ReportSettlementStatus;
  revision: number;
  supersedesSettlementId: string | null;
  rowVersion: number;
  totalGrams: number;
  grossAmountCrc: number;
  expensesCrc: number;
  netAmountCrc: number;
  participationAmountCrc: number;
  effectiveReceivedAmountCrc: number;
  lines: ReportSettlementLine[];
  expenses: ReportSettlementExpense[];
}

export interface SaveReportSettlementInput {
  supplierId: string;
  weekStart: string;
  buyerName: string;
  destination?: string;
  participationPercentage: number;
  receivedAmountCrc?: number;
  notes?: string;
  rowVersion?: number;
  lines: Array<{
    shipmentId: string;
    assayLabel?: string;
    karat: number;
    gramsLiquidated: number;
    pricePerKaratCrc?: number;
    pricePerGramCrc: number;
  }>;
  expenses: Array<{
    category: ReportExpenseCategory;
    concept: string;
    amountCrc: number;
    occurredOn: string;
    responsibleName?: string;
  }>;
}

export function useReportSettlements(fromDate: string, toDate: string) {
  const request = useReportRequest();
  const query = new URLSearchParams({ fromDate, toDate }).toString();
  return useQuery({
    queryKey: scopedQueryKey(
      "report-settlements",
      request.profileId,
      request.organizationId,
      query,
    ),
    enabled: request.enabled,
    queryFn: ({ signal }) =>
      apiRequest<ReportSettlement[]>(
        `/organizations/${encodeURIComponent(request.organizationId)}/reports/settlements?${query}`,
        request.token,
        { signal },
      ),
    ...cachePolicy.history,
  });
}

export function useSaveReportSettlement(settlementId: string | null) {
  const request = useReportRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveReportSettlementInput) =>
      apiRequest<ReportSettlement>(
        settlementId === null
          ? `/organizations/${encodeURIComponent(request.organizationId)}/reports/settlements`
          : `/organizations/${encodeURIComponent(request.organizationId)}/reports/settlements/${encodeURIComponent(settlementId)}`,
        request.token,
        {
          body: JSON.stringify(input),
          method: settlementId === null ? "POST" : "PATCH",
        },
      ),
    onSuccess: () => invalidateReports(queryClient, request),
  });
}

export function useTransitionReportSettlement() {
  const request = useReportRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      settlementId: string;
      rowVersion: number;
      status: ReportSettlementStatus;
    }) =>
      apiRequest<ReportSettlement>(
        `/organizations/${encodeURIComponent(request.organizationId)}/reports/settlements/${encodeURIComponent(input.settlementId)}/status`,
        request.token,
        {
          body: JSON.stringify({
            rowVersion: input.rowVersion,
            status: input.status,
          }),
          method: "POST",
        },
      ),
    onSuccess: () => invalidateReports(queryClient, request),
  });
}

export function useCreateReportSettlementCorrection() {
  const request = useReportRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settlementId: string) =>
      apiRequest<ReportSettlement>(
        `/organizations/${encodeURIComponent(request.organizationId)}/reports/settlements/${encodeURIComponent(settlementId)}/corrections`,
        request.token,
        { method: "POST" },
      ),
    onSuccess: () => invalidateReports(queryClient, request),
  });
}

function useReportRequest() {
  const auth = useAuth();
  return {
    token: auth.session?.access_token ?? "",
    organizationId: auth.profile?.organizationId ?? "",
    profileId: auth.profile?.profileId ?? "",
    enabled: auth.session !== null && auth.profile !== null,
  };
}

function invalidateReports(
  queryClient: ReturnType<typeof useQueryClient>,
  request: ReturnType<typeof useReportRequest>,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: scopedQueryKey(
        "report-settlements",
        request.profileId,
        request.organizationId,
      ),
    }),
    queryClient.invalidateQueries({
      queryKey: scopedQueryKey(
        "production-report",
        request.profileId,
        request.organizationId,
      ),
    }),
  ]);
}
