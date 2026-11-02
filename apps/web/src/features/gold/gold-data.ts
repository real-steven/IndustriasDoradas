import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import type {
  GoldResultEntry,
  GoldSummary,
  RecordShipmentGoldInput,
} from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { cachePolicy } from "../../app/cache-policy";
import { scopedQueryKey } from "../../app/query-keys";
import { useAuth } from "../../auth/auth-context";
import {
  shipmentDateRange,
  type ShipmentFilters,
} from "../management/management-shipments-data";

export function useGoldSummary(filters: ShipmentFilters) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  const query = goldQuery(filters);

  return useQuery({
    queryKey: scopedQueryKey("gold-summary", profileId, organizationId, query),
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) =>
      apiRequest<GoldSummary>(
        `/organizations/${encodeURIComponent(organizationId)}/management/gold-summary?${query}`,
        token,
        { signal },
      ),
    placeholderData: keepPreviousData,
    ...cachePolicy.live,
  });
}

export function useGoldHistory(shipmentId: string | null) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: scopedQueryKey(
      "gold-history",
      profileId,
      organizationId,
      shipmentId ?? "",
    ),
    enabled:
      auth.session !== null &&
      auth.profile !== null &&
      shipmentId !== null &&
      shipmentId.length > 0,
    queryFn: ({ signal }) =>
      apiRequest<GoldResultEntry[]>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments/${encodeURIComponent(shipmentId ?? "")}/gold-results`,
        token,
        { signal },
      ),
    ...cachePolicy.history,
  });
}

export function useRecordShipmentGold(shipmentId: string | null) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useMutation({
    mutationFn: (input: RecordShipmentGoldInput) => {
      if (shipmentId === null) throw new Error("Shipment is required");
      return apiRequest<GoldResultEntry>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments/${encodeURIComponent(shipmentId)}/gold-results`,
        token,
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    onSuccess: async () => {
      await Promise.all([
        invalidateScoped(
          queryClient,
          "gold-summary",
          profileId,
          organizationId,
        ),
        invalidateScoped(
          queryClient,
          "gold-history",
          profileId,
          organizationId,
        ),
        invalidateScoped(
          queryClient,
          "management-shipments",
          profileId,
          organizationId,
        ),
        invalidateScoped(
          queryClient,
          "management-shipment",
          profileId,
          organizationId,
        ),
        queryClient.invalidateQueries({
          queryKey: scopedQueryKey(
            "management-shipment-filter-options",
            profileId,
            organizationId,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: scopedQueryKey(
            "management-shipments-audit",
            profileId,
            organizationId,
          ),
        }),
        invalidateScoped(
          queryClient,
          "shipment-audit",
          profileId,
          organizationId,
        ),
      ]);
    },
  });
}

function invalidateScoped(
  queryClient: QueryClient,
  name: string,
  profileId: string,
  organizationId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: scopedQueryKey(name, profileId, organizationId),
  });
}

function goldQuery(filters: ShipmentFilters): string {
  const range = shipmentDateRange(filters);
  const params = new URLSearchParams();
  if (range.fromUtc !== undefined) params.set("fromUtc", range.fromUtc);
  if (range.toUtc !== undefined) params.set("toUtc", range.toUtc);
  if (filters.productionLineId !== undefined)
    params.set("productionLineId", filters.productionLineId);
  if (filters.supplierId !== undefined)
    params.set("supplierId", filters.supplierId);
  if (filters.responsibleWorkerId !== undefined)
    params.set("responsibleWorkerId", filters.responsibleWorkerId);
  return params.toString();
}
