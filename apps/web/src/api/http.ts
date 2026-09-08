import { readWebEnvironment } from "../config/environment";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
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
  const { apiBaseUrl } = readWebEnvironment();
  const response = await fetch(`${apiBaseUrl}/v1${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      code?: unknown;
      message?: unknown;
    };
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : typeof body.message === "string"
        ? body.message
        : "La solicitud no pudo completarse.";
    throw new ApiRequestError(
      response.status,
      typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
      message,
    );
  }
  return (await response.json()) as T;
}
