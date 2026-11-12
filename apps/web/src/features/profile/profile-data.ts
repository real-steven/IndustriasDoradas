import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  EmailChangeInput,
  SelfProfile,
  UpdateOwnProfileInput,
} from "../../api/generated/api-client";
import { apiRequest } from "../../api/http";
import { scopedQueryKey } from "../../app/query-keys";
import { useAuth } from "../../auth/auth-context";

function useProfileKey() {
  const auth = useAuth();
  return {
    token: auth.session?.access_token ?? "",
    enabled: auth.session !== null && auth.profile !== null,
    key: scopedQueryKey(
      "self-profile",
      auth.profile?.profileId ?? "",
      auth.profile?.organizationId ?? "",
    ),
  };
}

/**
 * Perfil propio. La URL de la foto es firmada y vence en 60 s, así que se
 * vuelve a pedir antes de que caduque y nunca se guarda fuera de memoria.
 */
export function useSelfProfile() {
  const { token, enabled, key } = useProfileKey();
  return useQuery({
    queryKey: key,
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<SelfProfile>("/me/profile", token, { signal }),
    staleTime: 45_000,
    refetchInterval: 50_000,
    refetchOnWindowFocus: true,
    gcTime: 60_000,
  });
}

function useProfileMutation<TInput>(
  request: (token: string, input: TInput) => Promise<SelfProfile>,
) {
  const { token, key } = useProfileKey();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => request(token, input),
    onSuccess: (profile) => queryClient.setQueryData(key, profile),
  });
}

export function useUpdateOwnProfile() {
  return useProfileMutation<UpdateOwnProfileInput>((token, input) =>
    apiRequest<SelfProfile>("/me/profile", token, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
}

export function useRequestEmailChange() {
  return useProfileMutation<EmailChangeInput>((token, input) =>
    apiRequest<SelfProfile>("/me/profile/email", token, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  );
}

export function useReplaceProfilePhoto() {
  return useProfileMutation<Blob>((token, photo) =>
    apiRequest<SelfProfile>("/me/profile/photo", token, {
      method: "PUT",
      body: photo,
      headers: { "Content-Type": "image/jpeg" },
    }),
  );
}

export function useRemoveProfilePhoto() {
  return useProfileMutation<void>((token) =>
    apiRequest<SelfProfile>("/me/profile/photo", token, { method: "DELETE" }),
  );
}
