// El nombre se muestra tal como está guardado: el rol se indica aparte
// (texto o badge), nunca como prefijo dentro del nombre.
export function workerDisplayName(name: string): string {
  return name;
}

function workerRoleOrder(category: string): number {
  return category === "JEFE_PLANTA" ? 0 : 1;
}

/** Jefes de planta primero, después operarios; alfabético dentro de cada grupo. */
export function compareWorkersForDirectory(
  left: { category: string; name: string },
  right: { category: string; name: string },
): number {
  return (
    workerRoleOrder(left.category) - workerRoleOrder(right.category) ||
    left.name.localeCompare(right.name, "es", { sensitivity: "base" }) ||
    left.name.localeCompare(right.name, "es")
  );
}
