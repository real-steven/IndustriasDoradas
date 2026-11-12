/**
 * Validación local del teléfono (misma regla que la API, que es la que decide).
 * Costa Rica: 8 dígitos (2, 4, 5, 6, 7 u 8), con o sin +506.
 * Internacional: + o 00 seguido de 8 a 15 dígitos.
 */
const CR_NATIONAL = /^[245678]\d{7}$/u;
const E164 = /^\+[1-9]\d{7,14}$/u;
const ALLOWED = /^[+\d\s().-]+$/u;

export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (raw === "" || raw.length > 24 || !ALLOWED.test(raw)) return null;
  if (raw.indexOf("+") > 0 || raw.split("+").length > 2) return null;
  let digits = raw.replace(/\D/gu, "");
  const international = raw.startsWith("+") || digits.startsWith("00");
  if (!raw.startsWith("+") && digits.startsWith("00")) digits = digits.slice(2);
  if (!international) return CR_NATIONAL.test(digits) ? `+506${digits}` : null;
  const candidate = `+${digits}`;
  if (!E164.test(candidate)) return null;
  if (digits.startsWith("506") && !CR_NATIONAL.test(digits.slice(3)))
    return null;
  return candidate;
}

export function formatPhone(phone: string | null): string {
  if (phone === null) return "";
  if (phone.startsWith("+506") && phone.length === 12)
    return `+506 ${phone.slice(4, 8)} ${phone.slice(8)}`;
  return phone;
}

export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/u).filter(Boolean);
  const letters =
    words.length >= 2
      ? `${words[0]?.[0] ?? ""}${words[words.length - 1]?.[0] ?? ""}`
      : (words[0]?.slice(0, 2) ?? "");
  return letters.toLocaleUpperCase("es") || "?";
}
