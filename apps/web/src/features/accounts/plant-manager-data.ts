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
import { useAuth } from "../../auth/auth-context";

export function usePlantManagers() {
  const request = useAccountRequest();
  return useQuery({
    queryKey: ["plant-managers", request.profileId, request.organizationId],
    enabled: request.enabled,
    queryFn: () =>
      apiRequest<PageAccount>(
        `/organizations/${encodeURIComponent(request.organizationId)}/accounts?page=1&pageSize=100&roleCode=JEFE_PLANTA`,
        request.token,
      ),
  });
}

export function usePlantWorkers() {
  const request = useAccountRequest();
  return useQuery({
    queryKey: ["plant-workers", request.profileId, request.organizationId],
    enabled: request.enabled,
    queryFn: () =>
      apiRequest<PageWorker>(
        `/organizations/${encodeURIComponent(request.organizationId)}/workers?page=1&pageSize=100&state=all`,
        request.token,
      ),
  });
}

export function useAccountPlants() {
  const request = useAccountRequest();
  return useQuery({
    queryKey: ["account-plants", request.profileId, request.organizationId],
    enabled: request.enabled,
    queryFn: () =>
      apiRequest<PageCatalog>(
        `/organizations/${encodeURIComponent(request.organizationId)}/plants?page=1&pageSize=100&state=active`,
        request.token,
      ),
  });
}

export function useAccountStations(plantId: string) {
  const request = useAccountRequest();
  return useQuery({
    queryKey: [
      "account-stations",
      request.profileId,
      request.organizationId,
      plantId,
    ],
    enabled: request.enabled && plantId.length > 0,
    queryFn: () =>
      apiRequest<PageCatalog>(
        `/organizations/${encodeURIComponent(request.organizationId)}/plants/${encodeURIComponent(plantId)}/stations?page=1&pageSize=100&state=active`,
        request.token,
      ),
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
      await queryClient.invalidateQueries({ queryKey: ["plant-managers"] });
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
        queryClient.invalidateQueries({ queryKey: ["plant-workers"] }),
        queryClient.invalidateQueries({ queryKey: ["attendance-workers"] }),
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
      await queryClient.invalidateQueries({ queryKey: ["plant-managers"] });
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
