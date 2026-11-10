import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Account,
  CreatePlantManagerInput,
  CreateWorkerRequestInput,
  PageAccount,
  PageCatalog,
  PageWorker,
  Worker,
} from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { cachePolicy } from "../../app/cache-policy";
import { scopedQueryKey } from "../../app/query-keys";
import { useAuth } from "../../auth/auth-context";

export function usePlantManagers() {
  const request = useAccountRequest();
  return useQuery({
    queryKey: scopedQueryKey(
      "plant-managers",
      request.profileId,
      request.organizationId,
    ),
    enabled: request.enabled,
    queryFn: ({ signal }) =>
      apiRequest<PageAccount>(
        `/organizations/${encodeURIComponent(request.organizationId)}/accounts?page=1&pageSize=100&roleCode=JEFE_PLANTA`,
        request.token,
        { signal },
      ),
    ...cachePolicy.personnel,
  });
}

export function usePlantWorkers() {
  const request = useAccountRequest();
  return useQuery({
    queryKey: scopedQueryKey(
      "plant-workers",
      request.profileId,
      request.organizationId,
    ),
    enabled: request.enabled,
    queryFn: ({ signal }) =>
      apiRequest<PageWorker>(
        `/organizations/${encodeURIComponent(request.organizationId)}/workers?page=1&pageSize=100&state=all`,
        request.token,
        { signal },
      ),
    ...cachePolicy.personnel,
  });
}

export function useAccountPlants() {
  const request = useAccountRequest();
  return useQuery({
    queryKey: scopedQueryKey(
      "account-plants",
      request.profileId,
      request.organizationId,
    ),
    enabled: request.enabled,
    queryFn: ({ signal }) =>
      apiRequest<PageCatalog>(
        `/organizations/${encodeURIComponent(request.organizationId)}/plants?page=1&pageSize=100&state=active`,
        request.token,
        { signal },
      ),
    ...cachePolicy.catalog,
  });
}

export function useAccountStations() {
  const request = useAccountRequest();
  return useQuery({
    queryKey: scopedQueryKey(
      "account-stations",
      request.profileId,
      request.organizationId,
    ),
    enabled: request.enabled,
    queryFn: ({ signal }) =>
      apiRequest<PageCatalog>(
        `/organizations/${encodeURIComponent(request.organizationId)}/stations?page=1&pageSize=100&state=active`,
        request.token,
        { signal },
      ),
    ...cachePolicy.catalog,
    // La estación se asigna automáticamente. No conservar una respuesta vacía
    // cuando la estación compartida acaba de activarse en otra vista o sesión.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

export function useCreatePlantManager() {
  const request = useAccountRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlantManagerInput) =>
      apiRequest<Account>(
        `/organizations/${encodeURIComponent(request.organizationId)}/accounts/plant-managers`,
        request.token,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: scopedQueryKey(
          "plant-managers",
          request.profileId,
          request.organizationId,
        ),
      });
    },
  });
}

export function useCreateOperator() {
  const request = useAccountRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkerRequestInput) =>
      apiRequest<Worker>(
        `/organizations/${encodeURIComponent(request.organizationId)}/worker-requests`,
        request.token,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: scopedQueryKey(
            "plant-workers",
            request.profileId,
            request.organizationId,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: scopedQueryKey(
            "attendance-workers",
            request.profileId,
            request.organizationId,
          ),
        }),
      ]);
    },
  });
}

export function useGovernPlantManager() {
  const request = useAccountRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      profileId,
      action,
      reason,
    }: {
      profileId: string;
      action: "approve" | "suspend" | "reactivate";
      reason?: string;
    }) =>
      apiRequest<Account>(
        `/organizations/${encodeURIComponent(request.organizationId)}/accounts/${encodeURIComponent(profileId)}/${action}`,
        request.token,
        {
          method: "POST",
          body: JSON.stringify(reason === undefined ? {} : { reason }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: scopedQueryKey(
          "plant-managers",
          request.profileId,
          request.organizationId,
        ),
      });
    },
  });
}

export function useSetPlantWorkerState() {
  const request = useAccountRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { workerId: string; active: boolean }) =>
      apiRequest<Worker>(
        `/organizations/${encodeURIComponent(request.organizationId)}/workers/${encodeURIComponent(input.workerId)}/state`,
        request.token,
        {
          method: "PATCH",
          body: JSON.stringify({ active: input.active }),
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: scopedQueryKey(
            "plant-workers",
            request.profileId,
            request.organizationId,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: scopedQueryKey(
            "payroll-workers",
            request.profileId,
            request.organizationId,
          ),
        }),
      ]);
    },
  });
}

function useAccountRequest() {
  const auth = useAuth();
  return {
    token: auth.session?.access_token ?? "",
    organizationId: auth.profile?.organizationId ?? "",
    profileId: auth.profile?.profileId ?? "",
    enabled: auth.session !== null && auth.profile !== null,
  };
}
