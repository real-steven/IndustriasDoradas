import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CatalogItem,
  CreateSupplierInput,
  PageCatalog,
  SetCatalogStateInput,
  UpdateSupplierInput,
} from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { cachePolicy } from "../../app/cache-policy";
import { scopedQueryKey } from "../../app/query-keys";
import { useAuth } from "../../auth/auth-context";

/** Proveedor operativo predeterminado: desktop lo propone por este nombre. */
export const DEFAULT_SUPPLIER_NAME = "Material propio";

export function isDefaultSupplier(supplier: Pick<CatalogItem, "name">) {
  return (
    supplier.name.trim().toLocaleLowerCase("es") ===
    DEFAULT_SUPPLIER_NAME.toLocaleLowerCase("es")
  );
}

/**
 * Orden del directorio: el predeterminado primero, luego activos por nombre
 * y al final los suspendidos.
 */
export function compareSuppliersForDirectory(
  left: CatalogItem,
  right: CatalogItem,
): number {
  const leftDefault = isDefaultSupplier(left);
  const rightDefault = isDefaultSupplier(right);
  if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
  if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
  return left.name.localeCompare(right.name, "es", { sensitivity: "base" });
}

export function useCanManageSuppliers(): boolean {
  const auth = useAuth();
  return auth.profile?.permissions.includes("suppliers.manage") ?? false;
}

export function useSuppliers() {
  const request = useSupplierRequest();
  return useQuery({
    queryKey: suppliersKey(request),
    enabled: request.enabled,
    queryFn: ({ signal }) =>
      apiRequest<PageCatalog>(
        `${supplierBase(request)}?page=1&pageSize=100&state=all`,
        request.token,
        { signal },
      ),
    ...cachePolicy.personnel,
  });
}

export function useCreateSupplier() {
  const request = useSupplierRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) =>
      apiRequest<CatalogItem>(supplierBase(request), request.token, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateSuppliers(queryClient, request),
  });
}

export function useUpdateSupplier() {
  const request = useSupplierRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      supplierId,
      ...input
    }: UpdateSupplierInput & { supplierId: string }) =>
      apiRequest<CatalogItem>(
        `${supplierBase(request)}/${encodeURIComponent(supplierId)}`,
        request.token,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: () => invalidateSuppliers(queryClient, request),
  });
}

export function useSetSupplierState() {
  const request = useSupplierRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      supplierId,
      ...input
    }: SetCatalogStateInput & { supplierId: string }) =>
      apiRequest<CatalogItem>(
        `${supplierBase(request)}/${encodeURIComponent(supplierId)}/state`,
        request.token,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: () => invalidateSuppliers(queryClient, request),
  });
}

function useSupplierRequest() {
  const auth = useAuth();
  return {
    token: auth.session?.access_token ?? "",
    organizationId: auth.profile?.organizationId ?? "",
    profileId: auth.profile?.profileId ?? "",
    enabled: auth.session !== null && auth.profile !== null,
  };
}

type SupplierRequest = ReturnType<typeof useSupplierRequest>;

function supplierBase(request: SupplierRequest): string {
  return `/organizations/${encodeURIComponent(request.organizationId)}/suppliers`;
}

function suppliersKey(request: SupplierRequest) {
  return scopedQueryKey(
    "personnel-suppliers",
    request.profileId,
    request.organizationId,
  );
}

function invalidateSuppliers(
  queryClient: ReturnType<typeof useQueryClient>,
  request: SupplierRequest,
) {
  return queryClient.invalidateQueries({ queryKey: suppliersKey(request) });
}
