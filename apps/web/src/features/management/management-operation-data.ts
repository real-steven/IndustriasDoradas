import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { PageManagementOperationLine } from "../../api/generated/api-client";
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

export function useManagementOperation(): ManagementOperationQuery {
  const auth = useAuth();
  const token = auth.session?.access_token ?? "";
  const organizationId = auth.profile?.organizationId ?? "";
  const profileId = auth.profile?.profileId ?? "";

  return useQuery({
    queryKey: ["management-operation", profileId, organizationId],
    enabled: auth.session !== null && auth.profile !== null,
    queryFn: () =>
      apiRequest<PageManagementOperationLine>(
        `/organizations/${encodeURIComponent(organizationId)}/management/operation-lines?page=1&pageSize=100`,
        token,
      ),
  });
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
