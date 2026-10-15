import { readWebEnvironment } from "../config/environment";

export const unauthorizedEventName = "industrias-doradas:unauthorized";
export const apiRequestTimeoutMs = 15_000;

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

export function requestErrorMessage(
  error: unknown,
  fallback = "No se pudo completar la consulta. Intente nuevamente.",
): string {
  if (error instanceof ApiConnectionError) {
    return error.code === "OFFLINE"
      ? "Sin conexión. Se conservarán los últimos datos disponibles."
      : "No fue posible conectar con el servicio. Intente nuevamente.";
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 401)
      return "La sesión venció. Inicie sesión nuevamente.";
    if (error.status === 403)
      return "La cuenta no tiene permiso para consultar esta información.";
    if (error.status >= 500)
      return "El servicio no está disponible temporalmente. Intente nuevamente.";
  }
  return fallback;
}

function safeApiMessage(status: number, serverMessage: string): string {
  if (status === 401) return "La sesión no es válida o venció.";
  if (status === 403) return "La cuenta no tiene permiso para esta acción.";
  if (status >= 500) return "El servicio no está disponible temporalmente.";
  return serverMessage;
}
