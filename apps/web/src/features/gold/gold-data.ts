import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import type {
  GoldReviewEntry,
  GoldResultEntry,
  GoldShipmentOverview,
  GoldSummary,
  PageManagementSweepMercury,
  RecordShipmentGoldInput,
  RecordSweepMercuryInput,
  ReviewShipmentGoldInput,
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

/**
 * Quilataje oficial (liquidaciones aprobadas o cerradas) y síntesis de mercurio
 * de los cargamentos visibles. React solo presenta lo que calcula la API.
 */
export function useGoldOverview(shipmentIds: readonly string[]) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  const ids = [...shipmentIds].sort().join(",");

  return useQuery({
    queryKey: scopedQueryKey("gold-overview", profileId, organizationId, ids),
    enabled: auth.session !== null && auth.profile !== null && ids.length > 0,
    queryFn: ({ signal }) =>
      apiRequest<GoldShipmentOverview[]>(
        `/organizations/${encodeURIComponent(organizationId)}/management/gold-overview?${new URLSearchParams({ shipmentIds: ids })}`,
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

export function useGoldReviewHistory(shipmentId: string | null) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: scopedQueryKey(
      "gold-review-history",
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
      apiRequest<GoldReviewEntry[]>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments/${encodeURIComponent(shipmentId ?? "")}/gold-reviews`,
        token,
        { signal },
      ),
    ...cachePolicy.history,
  });
}

export function useReviewShipmentGold(shipmentId: string | null) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useMutation({
    mutationFn: (input: ReviewShipmentGoldInput) => {
      if (shipmentId === null) throw new Error("Shipment is required");
      return apiRequest<GoldReviewEntry>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments/${encodeURIComponent(shipmentId)}/gold-reviews`,
        token,
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    onSuccess: async () =>
      invalidateGoldQueries(queryClient, profileId, organizationId),
  });
}

export function useRecordSweepMercury(
  shipmentId: string | null,
  sweepId: string | null,
) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useMutation({
    mutationFn: (input: RecordSweepMercuryInput) => {
      if (shipmentId === null || sweepId === null)
        throw new Error("Shipment and sweep are required");
      return apiRequest<PageManagementSweepMercury>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments/${encodeURIComponent(shipmentId)}/sweeps/${encodeURIComponent(sweepId)}/mercury`,
        token,
        { method: "POST", body: JSON.stringify(input) },
      );
    },
    onSuccess: async () => {
      await Promise.all([
        invalidateScoped(
          queryClient,
          "management-shipment-sweeps",
          profileId,
          organizationId,
        ),
        invalidateScoped(
          queryClient,
          "gold-overview",
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
          "shipment-audit",
          profileId,
          organizationId,
        ),
      ]);
    },
  });
}

async function invalidateGoldQueries(
  queryClient: QueryClient,
  profileId: string,
  organizationId: string,
) {
  await Promise.all([
    invalidateScoped(queryClient, "gold-summary", profileId, organizationId),
    invalidateScoped(
      queryClient,
      "gold-review-history",
      profileId,
      organizationId,
    ),
    invalidateScoped(
      queryClient,
      "management-shipments",
      profileId,
      organizationId,
    ),
  ]);
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
