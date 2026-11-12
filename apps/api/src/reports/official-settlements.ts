import type { ReportSettlementStatus } from "./report-settlements.contracts";

export interface SettlementVersion {
  id: string;
  status: ReportSettlementStatus;
  supersedesSettlementId: string | null;
}

/**
 * Fuente oficial del quilataje y de los totales financieros: solo cuentan las
 * liquidaciones aprobadas o cerradas en su revisión vigente. Una revisión queda
 * reemplazada únicamente cuando su corrección también fue aprobada o cerrada; un
 * borrador de corrección no invalida la versión aprobada anterior.
 *
 * La regla vive aquí para que reportes, exportaciones y "Oro y mercurio" usen la
 * misma verdad.
 */
export function officialSettlements<T extends SettlementVersion>(
  settlements: readonly T[],
): T[] {
  const approved = settlements.filter(
    (settlement) =>
      settlement.status === "APPROVED" || settlement.status === "CLOSED",
  );
  const superseded = new Set(
    approved.flatMap((settlement) =>
      settlement.supersedesSettlementId === null
        ? []
        : [settlement.supersedesSettlementId],
    ),
  );
  return approved.filter((settlement) => !superseded.has(settlement.id));
}
