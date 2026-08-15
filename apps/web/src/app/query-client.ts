import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        retryDelay: 500,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}
