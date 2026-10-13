import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  GoldResultEntry,
  GoldSummary,
  RecordShipmentGoldInput,
} from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
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
    queryKey: ["gold-summary", profileId, organizationId, query],
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: () =>
      apiRequest<GoldSummary>(
        `/organizations/${encodeURIComponent(organizationId)}/management/gold-summary?${query}`,
        token,
      ),
  });
}

export function useGoldHistory(shipmentId: string | null) {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: ["gold-history", profileId, organizationId, shipmentId ?? ""],
    enabled:
      auth.session !== null &&
      auth.profile !== null &&
      shipmentId !== null &&
      shipmentId.length > 0,
    queryFn: () =>
      apiRequest<GoldResultEntry[]>(
        `/organizations/${encodeURIComponent(organizationId)}/management/shipments/${encodeURIComponent(shipmentId ?? "")}/gold-results`,
        token,
      ),
  });
}

export function useRecordShipmentGold(shipmentId: string | null) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";

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
        queryClient.invalidateQueries({ queryKey: ["gold-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["gold-history"] }),
        queryClient.invalidateQueries({ queryKey: ["management-shipments"] }),
        queryClient.invalidateQueries({ queryKey: ["management-shipment"] }),
        queryClient.invalidateQueries({
          queryKey: ["management-shipment-filter-options"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["management-shipments-audit"],
        }),
        queryClient.invalidateQueries({ queryKey: ["shipment-audit"] }),
      ]);
    },
  });
}

function goldQuery(filters: ShipmentFilters): string {
  const range = shipmentDateRange(filters);
  const params = new URLSearchParams({
    fromUtc: range.fromUtc,
    toUtc: range.toUtc,
  });
  if (filters.productionLineId !== undefined)
    params.set("productionLineId", filters.productionLineId);
  if (filters.supplierId !== undefined)
    params.set("supplierId", filters.supplierId);
  if (filters.responsibleWorkerId !== undefined)
    params.set("responsibleWorkerId", filters.responsibleWorkerId);
  return params.toString();
}
