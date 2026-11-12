/**
 * Identificador público del cargamento.
 *
 * El identificador estable es el UUID del cargamento (`shipment_id`), el mismo
 * en SQLite, Outbox, Supabase y read models. El código corto que se muestra en
 * desktop, web, auditoría y reportes son sus primeros 8 caracteres en
 * mayúsculas; se deriva siempre del UUID y nunca se guarda aparte.
 */
export const SHIPMENT_CODE_PATTERN =
  /^(?:[0-9a-f]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;

export function shipmentCode(shipmentId: string): string {
  return shipmentId.slice(0, 8).toUpperCase();
}

/**
 * Rango cerrado de UUID que comparten el código indicado. Un UUID completo
 * devuelve un rango de un solo valor, es decir, la coincidencia exacta.
 */
export function shipmentCodeRange(code: string): [string, string] {
  const normalized = code.trim().toLowerCase();
  if (!SHIPMENT_CODE_PATTERN.test(normalized))
    throw new RangeError("Invalid shipment code");
  if (normalized.length === 36) return [normalized, normalized];
  return [
    `${normalized}-0000-0000-0000-000000000000`,
    `${normalized}-ffff-ffff-ffff-ffffffffffff`,
  ];
}
