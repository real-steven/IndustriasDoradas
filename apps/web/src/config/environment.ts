const DEFAULT_API_BASE_URL = "/api";

export interface WebEnvironment {
  apiBaseUrl: string;
}

export interface SupabaseWebEnvironment {
  supabaseUrl: string;
  supabasePublishableKey: string;
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

export function readSupabaseWebEnvironment(
  input: Record<string, unknown> = import.meta.env,
): SupabaseWebEnvironment {
  const url = input.VITE_SUPABASE_URL;
  const key = input.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== "string" || !isAbsoluteHttpUrl(url)) {
    throw new Error(
      "Configuracion web invalida: VITE_SUPABASE_URL es obligatoria.",
    );
  }
  if (typeof key !== "string" || !key.startsWith("sb_publishable_")) {
    throw new Error(
      "Configuracion web invalida: VITE_SUPABASE_PUBLISHABLE_KEY es obligatoria.",
    );
  }
  return { supabaseUrl: url.replace(/\/$/u, ""), supabasePublishableKey: key };
}

function isValidApiBaseUrl(value: string): boolean {
  if (value.startsWith("/")) {
    return true;
  }

  return isAbsoluteHttpUrl(value);
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
