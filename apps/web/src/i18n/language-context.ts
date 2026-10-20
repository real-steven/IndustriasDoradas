import { createContext, useContext } from "react";

export type Language = "es" | "en";

export interface LanguageContextValue {
  language: Language;
  locale: "es-CR" | "en-US";
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  tr: (spanish: string, english: string) => string;
}

const spanishFallback: LanguageContextValue = {
  language: "es",
  locale: "es-CR",
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
  tr: (spanish) => spanish,
};

export const LanguageContext =
  createContext<LanguageContextValue>(spanishFallback);

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

export function translateKnownMessage(
  message: string,
  language: Language,
): string {
  if (language === "es") return message;
  return knownEnglishMessages.get(message) ?? message;
}

const knownEnglishMessages = new Map<string, string>([
  [
    "No fue posible comprobar la sesión. Intente nuevamente.",
    "The session could not be verified. Please try again.",
  ],
  [
    "La sesión venció. Inicie sesión nuevamente.",
    "Your session expired. Please sign in again.",
  ],
  ["Correo o contraseña inválidos.", "Invalid email or password."],
  [
    "No se pudo solicitar la recuperación.",
    "Password recovery could not be requested.",
  ],
  [
    "No se pudo cerrar la sesión. Intente nuevamente.",
    "Could not sign out. Please try again.",
  ],
  [
    "Sin conexión. Se conservarán los últimos datos disponibles.",
    "Offline. The latest available data will be preserved.",
  ],
  [
    "No fue posible conectar con el servicio. Intente nuevamente.",
    "Could not connect to the service. Please try again.",
  ],
  [
    "La cuenta no tiene permiso para consultar esta información.",
    "This account is not allowed to view this information.",
  ],
  [
    "El servicio no está disponible temporalmente. Intente nuevamente.",
    "The service is temporarily unavailable. Please try again.",
  ],
]);
