const minute = 60_000;

export interface CachePolicy {
  staleTime: number;
  gcTime: number;
  refetchOnWindowFocus: boolean;
  refetchOnReconnect: boolean;
}

export const cachePolicy = {
  standard: {
    staleTime: 30_000,
    gcTime: 10 * minute,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  live: {
    staleTime: 15_000,
    gcTime: 5 * minute,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  personnel: {
    staleTime: minute,
    gcTime: 15 * minute,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  history: {
    staleTime: 2 * minute,
    gcTime: 30 * minute,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
  catalog: {
    staleTime: 10 * minute,
    gcTime: 60 * minute,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  health: {
    staleTime: 0,
    gcTime: minute,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  },
} as const satisfies Record<string, CachePolicy>;
