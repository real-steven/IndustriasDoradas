/**
 * Normaliza teléfonos de contacto a E.164.
 *
 * Acepta números de Costa Rica de 8 dígitos (con o sin +506 / 00506, con
 * espacios, guiones o paréntesis) e internacionales con prefijo `+` o `00`.
 * Devuelve `null` cuando el valor no es un teléfono válido.
 */
const CR_NATIONAL_PATTERN = /^[245678]\d{7}$/u;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/u;
const ALLOWED_CHARACTERS = /^[+\d\s().-]+$/u;

export const PHONE_MAX_INPUT_LENGTH = 24;

export function normalizePhoneNumber(input: string): string | null {
  const raw = input.trim();
  if (
    raw === "" ||
    raw.length > PHONE_MAX_INPUT_LENGTH ||
    !ALLOWED_CHARACTERS.test(raw)
  ) {
    return null;
  }
  if (raw.indexOf("+") > 0 || raw.split("+").length > 2) return null;

  let digits = raw.replace(/[^\d]/gu, "");
  const international = raw.startsWith("+") || digits.startsWith("00");
  if (!raw.startsWith("+") && digits.startsWith("00")) digits = digits.slice(2);

  if (!international) {
    if (CR_NATIONAL_PATTERN.test(digits)) return `+506${digits}`;
    return null;
  }

  const candidate = `+${digits}`;
  if (!E164_PATTERN.test(candidate)) return null;
  if (digits.startsWith("506") && !CR_NATIONAL_PATTERN.test(digits.slice(3))) {
    return null;
  }
  return candidate;
}

/** Deja visibles solo los últimos cuatro dígitos para auditoría. */
export function maskPhoneNumber(phone: string | null): string | null {
  if (phone === null) return null;
  const visible = phone.slice(-4);
  return `${phone.slice(0, phone.startsWith("+506") ? 4 : 3)}••••${visible}`;
}
