import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiDownload, apiRequest } from "../../api/http";
import { cachePolicy } from "../../app/cache-policy";
import { scopedQueryKey } from "../../app/query-keys";
import { useAuth } from "../../auth/auth-context";
import type { Language } from "../../i18n/language-context";
import {
  statisticsDateRange,
  type StatisticsFilters,
} from "../statistics/statistics-data";

export interface ReportMetrics {
  completedShipments: number;
  totalCajuelas: number;
  sweepCount: number;
  goldShipments: number;
  pendingGoldShipments: number;
  totalGoldGrams: number;
  includedCajuelas: number;
  gramsPerCajuela: number | null;
  palosPerCajuela: number | null;
  goldCoveragePercentage: number;
}

export interface ReportSupplier extends ReportMetrics {
  supplierId: string;
  supplierName: string;
}

export interface ReportShipment {
  shipmentId: string;
  shipmentCode: string;
  productionLineName: string;
  supplierId: string;
  supplierName: string;
  responsibleWorkerName: string | null;
  completedAtUtc: string;
  durationHours: number;
  cajuelaTotal: number;
  sweepCount: number;
  goldStatus: "REGISTERED" | "PENDING";
  goldAmountGrams: number | null;
  gramsPerCajuela: number | null;
  palosPerCajuela: number | null;
}

export interface ProductionReport {
  version: "production-gold-v1";
  language: Language;
  timezone: "America/Costa_Rica";
  generatedAtUtc: string;
  period: { fromUtc: string; toUtc: string };
  summary: ReportMetrics;
  suppliers: ReportSupplier[];
  shipments: ReportShipment[];
}

export function useProductionReport(
  filters: StatisticsFilters,
  language: Language,
) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  const query = reportQuery(filters, language);
  return useQuery({
    queryKey: scopedQueryKey(
      "production-report",
      profileId,
      organizationId,
      query,
    ),
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) =>
      apiRequest<ProductionReport>(
        `/organizations/${encodeURIComponent(organizationId)}/reports/production?${query}`,
        token,
        { signal },
      ),
    placeholderData: keepPreviousData,
    ...cachePolicy.history,
  });
}

export async function downloadProductionReport(
  organizationId: string,
  accessToken: string,
  filters: StatisticsFilters,
  language: Language,
  format: "xlsx" | "pdf",
): Promise<void> {
  const query = reportQuery(filters, language);
  const result = await apiDownload(
    `/organizations/${encodeURIComponent(organizationId)}/reports/production.${format}?${query}`,
    accessToken,
  );
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename ?? `reporte-produccion-oro.${format}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function reportQuery(filters: StatisticsFilters, language: Language): string {
  const range = statisticsDateRange(filters);
  const parameters = new URLSearchParams({
    fromUtc: range.fromUtc,
    toUtc: range.toUtc,
    language,
  });
  if (filters.productionLineId !== undefined)
    parameters.set("productionLineId", filters.productionLineId);
  if (filters.supplierId !== undefined)
    parameters.set("supplierId", filters.supplierId);
  return parameters.toString();
}
