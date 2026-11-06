import { readWebEnvironment } from "../config/environment";
import type { Language } from "../i18n/language-context";

export const unauthorizedEventName = "industrias-doradas:unauthorized";
export const apiRequestTimeoutMs = 15_000;
export const apiDownloadTimeoutMs = 60_000;

type AccessTokenRefresher = () => Promise<string | null>;

let accessTokenRefresher: AccessTokenRefresher | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function registerAccessTokenRefresher(
  refresher: AccessTokenRefresher,
): () => void {
  accessTokenRefresher = refresher;
  refreshInFlight = null;
  return () => {
    if (accessTokenRefresher === refresher) accessTokenRefresher = null;
    refreshInFlight = null;
  };
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class ApiConnectionError extends Error {
  constructor(
    public readonly code: "OFFLINE" | "NETWORK_UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  return requestWithToken<T>(path, accessToken, init, true);
}

export interface ApiDownload {
  blob: Blob;
  filename: string | null;
}

export async function apiDownload(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<ApiDownload> {
  return downloadWithToken(path, accessToken, init, true);
}

async function requestWithToken<T>(
  path: string,
  accessToken: string,
  init: RequestInit,
  allowTokenRefresh: boolean,
): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ApiConnectionError(
      "OFFLINE",
      "Sin conexión. Compruebe la red e intente nuevamente.",
    );
  }
  const { apiBaseUrl } = readWebEnvironment();
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), apiRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
  } catch (error) {
    if (callerSignal?.aborted) throw error;
    throw new ApiConnectionError(
      "NETWORK_UNAVAILABLE",
      "No fue posible conectar con el servicio.",
    );
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      allowTokenRefresh &&
      accessTokenRefresher !== null
    ) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken !== null) {
        return requestWithToken<T>(path, refreshedToken, init, false);
      }
    }
    const body = (await response.json().catch(() => ({}))) as {
      code?: unknown;
      message?: unknown;
    };
    const serverMessage = Array.isArray(body.message)
      ? body.message.join(", ")
      : typeof body.message === "string"
        ? body.message
        : "La solicitud no pudo completarse.";
    if (response.status === 401 && typeof window !== "undefined")
      window.dispatchEvent(new Event(unauthorizedEventName));
    throw new ApiRequestError(
      response.status,
      typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
      safeApiMessage(response.status, serverMessage),
    );
  }
  return (await response.json()) as T;
}

async function downloadWithToken(
  path: string,
  accessToken: string,
  init: RequestInit,
  allowTokenRefresh: boolean,
): Promise<ApiDownload> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ApiConnectionError(
      "OFFLINE",
      "Sin conexión. Compruebe la red e intente nuevamente.",
    );
  }
  const { apiBaseUrl } = readWebEnvironment();
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), apiDownloadTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    });
  } catch (error) {
    if (callerSignal?.aborted) throw error;
    throw new ApiConnectionError(
      "NETWORK_UNAVAILABLE",
      "No fue posible conectar con el servicio.",
    );
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      allowTokenRefresh &&
      accessTokenRefresher !== null
    ) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken !== null) {
        return downloadWithToken(path, refreshedToken, init, false);
      }
    }
    const body = (await response.json().catch(() => ({}))) as {
      code?: unknown;
      message?: unknown;
    };
    const serverMessage = Array.isArray(body.message)
      ? body.message.join(", ")
      : typeof body.message === "string"
        ? body.message
        : "La descarga no pudo completarse.";
    if (response.status === 401 && typeof window !== "undefined")
      window.dispatchEvent(new Event(unauthorizedEventName));
    throw new ApiRequestError(
      response.status,
      typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
      safeApiMessage(response.status, serverMessage),
    );
  }
  return {
    blob: await response.blob(),
    filename: responseFilename(response.headers.get("content-disposition")),
  };
}

function responseFilename(contentDisposition: string | null): string | null {
  if (contentDisposition === null) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(contentDisposition)?.[1];
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
  return /filename="?([^";]+)"?/iu.exec(contentDisposition)?.[1] ?? null;
}

async function refreshAccessToken(): Promise<string | null> {
  if (accessTokenRefresher === null) return null;
  refreshInFlight ??= accessTokenRefresher().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export function requestErrorMessage(
  error: unknown,
  fallback: string | undefined = undefined,
  language: Language = "es",
): string {
  if (error instanceof ApiConnectionError) {
    if (error.code === "OFFLINE")
      return language === "es"
        ? "Sin conexión. Se conservarán los últimos datos disponibles."
        : "Offline. The latest available data will be preserved.";
    return language === "es"
      ? "No fue posible conectar con el servicio. Intente nuevamente."
      : "Could not connect to the service. Please try again.";
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 401)
      return language === "es"
        ? "La sesión venció. Inicie sesión nuevamente."
        : "Your session expired. Please sign in again.";
    if (error.status === 403)
      return language === "es"
        ? "La cuenta no tiene permiso para consultar esta información."
        : "This account is not allowed to view this information.";
    if (error.status >= 400 && error.status < 500) return error.message;
    if (error.status >= 500)
      return language === "es"
        ? "El servicio no está disponible temporalmente. Intente nuevamente."
        : "The service is temporarily unavailable. Please try again.";
  }
  return (
    fallback ??
    (language === "es"
      ? "No se pudo completar la consulta. Intente nuevamente."
      : "The request could not be completed. Please try again.")
  );
}

function safeApiMessage(status: number, serverMessage: string): string {
  if (status === 401) return "La sesión no es válida o venció.";
  if (status === 403) return "La cuenta no tiene permiso para esta acción.";
  if (status >= 500) return "El servicio no está disponible temporalmente.";
  return serverMessage;
}
