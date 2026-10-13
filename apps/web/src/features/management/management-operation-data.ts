import { useEffect, useRef } from "react";
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import type {
  ManagementFreshness,
  PageManagementOperationLine,
} from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { useAuth } from "../../auth/auth-context";

const costaRicaDateTime = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
});

export type ManagementOperationQuery = UseQueryResult<
  PageManagementOperationLine,
  Error
>;
export type ManagementFreshnessQuery = UseQueryResult<
  ManagementFreshness,
  Error
>;

export function useManagementOperation(): ManagementOperationQuery {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: ["management-operation", profileId, organizationId],
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) =>
      apiRequest<PageManagementOperationLine>(
        `/organizations/${encodeURIComponent(organizationId)}/management/operation-lines?page=1&pageSize=100`,
        token,
        { signal },
      ),
  });
}

export function useManagementFreshness(): ManagementFreshnessQuery {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";
  const scope = `${profileId}:${organizationId}`;
  const cursors = useRef(new Map<string, string>());

  const query = useQuery({
    queryKey: ["management-freshness", profileId, organizationId],
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: ({ signal }) => {
      const parameters = new URLSearchParams();
      const currentCursor = cursors.current.get(scope);
      if (currentCursor !== undefined) parameters.set("cursor", currentCursor);
      const suffix = parameters.size === 0 ? "" : `?${parameters}`;
      return apiRequest<ManagementFreshness>(
        `/organizations/${encodeURIComponent(organizationId)}/management/freshness${suffix}`,
        token,
        { signal },
      );
    },
    refetchInterval: (current) =>
      (current.state.data?.pollAfterSeconds ?? 30) * 1000,
    refetchIntervalInBackground: false,
    staleTime: 25_000,
  });

  useEffect(() => {
    if (query.data === undefined) return;
    const hadCursor = cursors.current.has(scope);
    cursors.current.set(scope, query.data.cursor);
    if (!hadCursor || !query.data.hasChanges) return;

    const affectedKeys = [
      "management-operation",
      "management-shipments",
      "management-shipment-filter-options",
      "management-shipments-audit",
      "management-shipment",
      "management-shipment-sweeps",
      "shipment-audit",
      "gold-summary",
    ];
    void Promise.all(
      affectedKeys.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey: [queryKey] }),
      ),
    );
  }, [query.data, queryClient, scope]);

  return query;
}

export function operationHeadline(query: ManagementOperationQuery): string {
  if (query.isPending) return "Consultando operación";
  if (query.data === undefined) return "Consulta no disponible";
  if (query.data.total === 0) return "Sin líneas activas";
  return query.data.total === 1
    ? "1 línea activa"
    : `${query.data.total} líneas activas`;
}

export function formatCostaRicaDateTime(value: string | number): string {
  return costaRicaDateTime.format(new Date(value));
}

export function effectiveManagementTime(
  operation: ManagementOperationQuery,
  freshness: ManagementFreshnessQuery,
): string | null {
  if (
    freshness.data?.effectiveAtUtc !== null &&
    freshness.data?.effectiveAtUtc !== undefined
  )
    return freshness.data.effectiveAtUtc;
  const timestamps = operation.data?.items.map((line) =>
    Date.parse(line.lastActivityAtUtc),
  );
  if (timestamps === undefined || timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}
