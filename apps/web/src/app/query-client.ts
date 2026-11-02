import { QueryClient } from "@tanstack/react-query";

import { ApiConnectionError, ApiRequestError } from "../api/http";
import { cachePolicy } from "./cache-policy";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: 500,
        ...cachePolicy.standard,
      },
    },
  });
}

export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ApiConnectionError) return error.code !== "OFFLINE";
  if (error instanceof ApiRequestError)
    return error.status === 408 || error.status === 429 || error.status >= 500;
  return true;
}
