const DEFAULT_API_BASE_URL = "/api";

export interface WebEnvironment {
  apiBaseUrl: string;
}

export function readWebEnvironment(
  input: Record<string, unknown> = import.meta.env,
): WebEnvironment {
  const apiBaseUrl = input.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;

  if (typeof apiBaseUrl !== "string" || !isValidApiBaseUrl(apiBaseUrl)) {
    throw new Error(
      "Configuracion web invalida: VITE_API_BASE_URL debe ser una ruta que comienza con / o una URL HTTP/HTTPS absoluta.",
    );
  }

  return { apiBaseUrl: apiBaseUrl.replace(/\/$/, "") };
}

function isValidApiBaseUrl(value: string): boolean {
  if (value.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
