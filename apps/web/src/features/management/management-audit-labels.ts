import type { AuditEvent } from "./management-shipments-data";

export function managerAuditAction(
  event: AuditEvent,
  language: "es" | "en",
): string {
  const es = language === "es";
  const changed = event.changedFields ?? [];
  const beforeGold = event.changes?.gold_amount_grams?.before;

  if (event.action === "sync.ingest") {
    const messages: Record<string, readonly [string, string]> = {
      shipment: [
        "La planta sincronizó un cargamento",
        "The plant synchronized a shipment",
      ],
      production_event: [
        "La planta actualizó la producción",
        "The plant updated production",
      ],
      production_sweep: [
        "La planta registró una barrida",
        "The plant recorded a sweep",
      ],
      attendance_event: [
        "La planta registró asistencia",
        "The plant recorded attendance",
      ],
    };
    const message = messages[event.entityType];
    return message === undefined
      ? es
        ? "La planta envió nueva información"
        : "The plant sent new information"
      : message[es ? 0 : 1];
  }

  if (event.action === "business.mutation") {
    if (
      event.entityType === "shipment" &&
      changed.includes("gold_amount_grams")
    )
      return beforeGold === null || beforeGold === undefined
        ? es
          ? "Se registró un resultado de oro"
          : "A gold result was recorded"
        : es
          ? "Se corrigió un resultado de oro"
          : "A gold result was corrected";
    const messages: Record<string, readonly [string, string]> = {
      worker: ["Se actualizó un trabajador", "A worker was updated"],
      worker_request: [
        "Se resolvió una solicitud de trabajador",
        "A worker request was resolved",
      ],
      supplier: ["Se actualizó un proveedor", "A supplier was updated"],
      production_line: [
        "Se actualizó una línea de producción",
        "A production line was updated",
      ],
      station: ["Se actualizó una estación", "A station was updated"],
      plant: ["Se actualizó una planta", "A plant was updated"],
      shipment: ["Se actualizó un cargamento", "A shipment was updated"],
    };
    const message = messages[event.entityType];
    return message === undefined
      ? es
        ? "Se guardó una actualización administrativa"
        : "An administrative update was saved"
      : message[es ? 0 : 1];
  }

  const actions: Record<string, readonly [string, string]> = {
    "account.provision": [
      "Se creó una cuenta de usuario",
      "A user account was created",
    ],
    "account.governance": [
      "Se cambió el estado de una cuenta",
      "An account status was changed",
    ],
    "permission.governance": [
      "Se actualizaron permisos de usuario",
      "User permissions were updated",
    ],
    "privilege.elevation": [
      "Se autorizó una acción protegida",
      "A protected action was authorized",
    ],
    "authorization.policy": [
      "El sistema revisó un permiso",
      "The system checked a permission",
    ],
  };
  const message = actions[event.action];
  return message === undefined
    ? es
      ? "Se registró una actividad importante"
      : "Important activity was recorded"
    : message[es ? 0 : 1];
}
